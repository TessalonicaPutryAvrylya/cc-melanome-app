require('dotenv').config();
const path = require("path");
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const crypto = require('crypto');
const { bucket, db, Firestore } = require('./configdata'); // Import configuration including Firestore
const { loadModel, predictClassification } = require('./loadmodel'); // Import functions from loadmodel.js

const app = express();
app.use(cors());
app.use(express.json());

const multerStorage = multer.memoryStorage();
const upload = multer({
    storage: multerStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB file size limit
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed'), false);
        }
        cb(null, true);
    }
});

const uploadToGCS = (file) => {
    return new Promise((resolve, reject) => {
        const blob = bucket.file(Date.now() + "--" + file.originalname);
        const blobStream = blob.createWriteStream({
            resumable: false,
        });

        blobStream.on("error", (err) => {
            reject(err);
        });

        blobStream.on("finish", () => {
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
            resolve(publicUrl);
        });

        blobStream.end(file.buffer);
    });
};

let model;
loadModel().then((loadedModel) => {
    model = loadedModel;
}).catch((err) => {
    console.error("Error loading model:", err);
});

// Route handler for root URL to display welcome message
app.get("/", (req, res) => {
    res.send("Selamat datang “MelanoScan” Your Initial Melanoma App");
});
// Route handler to upload a single file
app.post("/v1.1/scan-upload", (req, res) => {
    upload.single("image")(req, res, async (err) => {
        if (err) {
            return res.status(400).send({ error: err.message });
        }

        const userId = req.body.userId; // Get user ID from request body
        if (!userId) {
            return res.status(400).send({ error: 'User ID is required' });
        }

        try {
            const publicUrl = await uploadToGCS(req.file);
            const id = crypto.randomUUID();
            const fileName = req.file.originalname;
            const uploadedAt = Firestore.Timestamp.now();
            const url = publicUrl;

            // Prediction using the model and uploaded image
            const predictionResult = await predictClassification(model, req.file.buffer, fileName);

            const data = {
                id,
                userId,
                fileName,
                uploadedAt,
                url,
                confidence: predictionResult.confidenceScore, // Directly use the confidence score from the prediction result
                explanation: predictionResult.explanation,
                suggestion: predictionResult.suggestion,
            };

            // Save data to Firestore with a document ID generated from random ID
            await db.doc(id).set(data);

            // Format response
            const formattedResponse = {
                responCode: "200",
                responMessage: "Success",
                id,
                userId,
                fileName,
                uploadedAt: new Date(uploadedAt.toMillis()).toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }),
                url,
                confidence: data.confidence,
                explanation: data.explanation,
                suggestion: data.suggestion,
            };

            res.status(200).json(formattedResponse);
        } catch (error) {
            console.error("Error during upload:", error);
            res.status(500).send({ error: "Error uploading file: " + error.message });
        }
    });
});


// Function to format Firestore timestamp to a readable string
const formatTimestamp = (timestamp) => {
    return new Date(timestamp._seconds * 1000).toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
};

// Route handler to fetch upload history based on user ID
app.get("/v1.1/scan-history", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        return res.status(400).json({ responCode: "400", responMessage: 'User ID is required' });
    }

    try {
        const snapshot = await db.where('userId', '==', userId).get();

        if (snapshot.empty) {
            return res.status(404).json({ responCode: "404", responMessage: 'No history found' });
        }

        const history = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            data.uploadedAt = formatTimestamp(data.uploadedAt); // Format timestamp before adding to result
            history.push(data);
        });

        res.status(200).json(history);
    } catch (error) {
        console.error("Error retrieving history:", error);
        res.status(500).json({ responCode: "500", responMessage: "Error retrieving history: " + error.message });
    }
});

app.listen(5000, '0.0.0.0', () => {
    console.log("Server is running on port 5000 and accessible externally");
});
