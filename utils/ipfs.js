require("dotenv").config();
const axios = require("axios");

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY;

async function uploadToIPFS(data) {
    try {
        const response = await axios.post(
            "https://api.pinata.cloud/pinning/pinJSONToIPFS",
            data,
            {
                headers: {
                    pinata_api_key: PINATA_API_KEY,
                    pinata_secret_api_key: PINATA_SECRET_API_KEY,
                },
            }
        );

        return response.data.IpfsHash;
    } catch (error) {
        console.error("IPFS Upload Error:", error.response?.data || error.message);
    }
}

module.exports = { uploadToIPFS };