require('dotenv').config();
const tf = require('@tensorflow/tfjs-node');
const path = require('path');
const fs = require('fs');

const modelPath = path.resolve(__dirname, 'models-bangkit/model.json');
console.log(`Loading model from: ${modelPath}`);

const loadModel = async () => {
    try {
        if (!fs.existsSync(modelPath)) {
            throw new Error('Model path does not exist');
        }

        // Read model.json content for debugging
        const modelJson = JSON.parse(fs.readFileSync(modelPath, 'utf8'));

        // Add `producer` property if it does not exist
        if (!modelJson.producer) {
            console.warn('Model JSON is missing `producer` property. Adding default value.');
            modelJson.producer = 'TensorFlow.js';
            fs.writeFileSync(modelPath, JSON.stringify(modelJson, null, 2));
        }

        const model = await tf.loadLayersModel(`file://${modelPath}`);
        console.log("Model loaded successfully");
        return model;
    } catch (error) {
        console.error("Error loading model:", error.message);
        return null;
    }
};

// Function to make predictions using the model
const predictClassification = async (model, image, fileName) => {
    try {
        const tensor = tf.node.decodeImage(image).expandDims(0).toFloat().div(tf.scalar(255.0));

        const classes = ['MEL', 'NV', 'BCC', 'BKL'];
        const prediction = model.predict(tensor);
        const scores = await prediction.data();
        const maxScore = Math.max(...scores);
        const maxScoreIndex = scores.indexOf(maxScore);
        const label = classes[maxScoreIndex];
        const confidenceScore = maxScore;

        let explanation = '';
        let suggestion = '';

        switch (label) {
            case 'MEL':
                explanation = "Melanoma";
                suggestion = "Seek immediate medical attention as melanoma can be a serious form of skin cancer.";
                break;
            case 'NV':
                explanation = "Melanocytic Nevus";
                suggestion = "Observe your moles for changes in size, shape, or color. If there are any changes, consult a doctor immediately.";
                break;
            case 'BCC':
                explanation = "Basal Cell Carcinoma";
                suggestion = "Have regular skin checks to detect the possibility of new or recurrent cancers.";
                break;
            case 'BKL':
                explanation = "Benign Keratosis";
                suggestion = "Although usually harmless, it is advisable to see a dermatologist to confirm the diagnosis and make sure there are no more serious conditions.";
                break;
            default:
                explanation = "No explanation available";
                suggestion = "";
        }

        return { confidenceScore, label, explanation, suggestion };
    } catch (error) {
        console.error('Error in prediction:', error.message);
        throw new Error(`Terjadi kesalahan input: ${error.message}`);
    }
};

module.exports = { loadModel, predictClassification };
