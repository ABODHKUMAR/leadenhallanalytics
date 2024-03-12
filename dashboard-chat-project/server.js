const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mysql = require('mysql');
const { OpenAI } = require("openai");

dotenv.config();
const app = express();

app.use(cors());
const PORT = process.env.PORT || 5000;

app.use(express.json());

// Create a pool for database connection
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER ,
    password: process.env.DB_PASSWORD ,
    database: process.env.DB_NAME ,
    connectionLimit: 10
});

// Check database connection
pool.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err);
    } else {
        console.log('Database connected!');
        connection.release();
    }
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY  // This is also the default, can be omitted
});

// Endpoint to handle natural language queries
app.post('/query', async (req, res) => {
    let { query } = req.body;
    query = "Write a SQL query which computes " + query ;
    try {
        // Step 1: Convert natural language query to SQL using AI
        const chatCompletion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    "role": "system",
                    "content": "Given the following SQL tables, your job is to write queries given a user’s request.\n\nI have TABLE insurancedata (\nYear int ,\nBrokerName varchar(255),\nGWP decimal(18,4)\nPlannedGWP decimal(18,4)\nMarketType varchar(255)\\nPRIMARY KEY (Year)\n)\n\nI have TABLE businessdata (\nYear int ,\nClassOfBusiness varchar(255),\nClassType varchar(255),\nBusinessPlan decimal(18,2),\nEarnedPremium decimal(18,2),\nGWP decimal(18,2)\n);"
                },
                {
                    "role": "user",
                    "content": query
                }
            ],
            temperature: 0,
            max_tokens: 1024,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0
        });

        // Log the entire response for debugging purposes
        console.log(chatCompletion);

        // Extract SQL query from the OpenAI response
        if (chatCompletion && chatCompletion.choices && chatCompletion.choices.length > 0) {
            let sqlQuery = chatCompletion.choices[0].message.content;
            console.log("Generated SQL Query:", sqlQuery);
  
            // Check if the SQL query is a SELECT query
            if (!sqlQuery.toLowerCase().includes("select")) {
                // Respond with a default message if it's not a SELECT query
                console.error("Invalid SQL Query:", sqlQuery);
                res.status(500).json({ error: "Hey, I'm Merra. How can I help you?" });
                return; // Exit the function
            }

            // Remove triple backticks and 'sql' code block formatting from the SQL query
            sqlQuery = sqlQuery.replace(/^```sql\n|```$/g, '');
            console.log("Modified SQL Query:", sqlQuery); // Log the modified SQL query

            // Execute the SQL query against the database
            pool.query(sqlQuery, async (error, results) => {
                if (error) {
                    console.error("SQL Error:", error);
                    // Handle SQL errors appropriately
                    const errorMessage = "Hey, I'm Merra. How can I help you?";
                    res.status(500).json({ error: errorMessage });
                } else {
                    // Log the SQL results for debugging purposes
                    console.log("SQL Results:", results);

                    // Convert SQL results to normal English using OpenAI's chat completions
                    const convertToNormal = await openai.chat.completions.create({
                        model: "gpt-3.5-turbo",
                        messages: [{ role: "user", content: "Convert to Normal English Like chat bot: " + JSON.stringify(results) }],
                        temperature: 0,
                        max_tokens: 1024,
                        top_p: 1,
                        frequency_penalty: 0,
                        presence_penalty: 0
                    });

                    if (convertToNormal && convertToNormal.choices && convertToNormal.choices.length > 0) {
                        const data = convertToNormal.choices[0].message.content;
                        // Send the converted data back to the client
                        res.json({ data });
                    } else {
                        console.error("No valid response from OpenAI.");
                        res.status(500).json({ error: "No valid response from OpenAI" });
                    }
                }
            });
        } else {
            console.error("Invalid response from OpenAI.");
            res.status(500).json({ error: "Hey, I'm Merra. How can I help you?" });
        }
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "An error occurred while processing the request" });
    }
});
app.get('/businessdata', async (req, res) => {
    try {
        let sqlQuery = "SELECT * FROM businessdata";

        pool.query(sqlQuery, (error, results) => {
            if (error) {
                console.error("SQL Error:", error);
                // Handle SQL errors appropriately
                const errorMessage = "Internal Server Error";
                res.status(500).json({ error: errorMessage });
            } else {
                // Log the SQL results for debugging purposes
                console.log("SQL Results:", results);

                if (results && results.length > 0) {
                    res.json({ results });
                } else {
                    console.error("No valid response from the database.");
                    res.status(404).json({ error: "Data not found" });
                }
            }
        });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "An error occurred while processing the request" });
    }
});

app.get('/insurancedata', async (req, res) => {
    try {
        let sqlQuery = "SELECT * FROM insurancedata";

        pool.query(sqlQuery, (error, results) => {
            if (error) {
                console.error("SQL Error:", error);
                // Handle SQL errors appropriately
                const errorMessage = "Internal Server Error";
                res.status(500).json({ error: errorMessage });
            } else {
                // Log the SQL results for debugging purposes
                console.log("SQL Results:", results);

                if (results && results.length > 0) {
                    res.json({ results });
                } else {
                    console.error("No valid response from the database.");
                    res.status(404).json({ error: "Data not found" });
                }
            }
        });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "An error occurred while processing the request" });
    }
});
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});