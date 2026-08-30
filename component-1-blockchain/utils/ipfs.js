require("dotenv").config();

const axios = require("axios");
const FormData = require("form-data");


// =====================================================
// PINATA CONFIGURATION
// =====================================================
//
// Current Pinata V3 Files API uses JWT/Bearer auth.
//
// Required:
//
// PINATA_JWT
// IPFS_GATEWAY
//
// =====================================================

const PINATA_JWT =
    process.env.PINATA_JWT;


const PINATA_GATEWAY =
    (
        process.env.IPFS_GATEWAY ||
        "coral-top-mackerel-788.mypinata.cloud"
    )
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");


// =====================================================
// IPFS GATEWAY FALLBACKS
// =====================================================

const IPFS_GATEWAYS = [

    `https://${PINATA_GATEWAY}/ipfs`,

    "https://gateway.pinata.cloud/ipfs",

    "https://dweb.link/ipfs",

    "https://ipfs.io/ipfs"

];


// =====================================================
// UPLOAD JSON TO PUBLIC IPFS USING PINATA V3
// =====================================================
//
// Current Pinata V3 endpoint:
//
// POST https://uploads.pinata.cloud/v3/files
//
// Authentication:
//
// Authorization: Bearer <PINATA_JWT>
//
// Permission:
//
// org:files:write
//
// =====================================================

async function uploadToIPFS(data) {

    try {

        if (
            !PINATA_JWT ||
            typeof PINATA_JWT !== "string" ||
            PINATA_JWT.trim() === ""
        ) {

            throw new Error(
                "PINATA_JWT is missing from environment variables."
            );

        }


        // =================================================
        // CONVERT JSON OBJECT INTO A FILE
        // =================================================

        const jsonString =
            JSON.stringify(
                data,
                null,
                2
            );


        const form =
            new FormData();


        form.append(
            "network",
            "public"
        );


        form.append(
            "file",
            Buffer.from(
                jsonString,
                "utf8"
            ),
            {
                filename:
                    "data.json",

                contentType:
                    "application/json"
            }
        );


        form.append(
            "name",
            "academic-proof.json"
        );


        // =================================================
        // PINATA V3 UPLOAD
        // =================================================

        const response =
            await axios.post(

                "https://uploads.pinata.cloud/v3/files",

                form,

                {

                    headers: {

                        Authorization:
                            `Bearer ${PINATA_JWT.trim()}`,

                        ...form.getHeaders(),

                        "User-Agent":
                            "Blockchain-Grading-System/1.0"

                    },

                    timeout:
                        30000,

                    maxContentLength:
                        Infinity,

                    maxBodyLength:
                        Infinity

                }

            );


        // =================================================
        // RESPONSE VALIDATION
        // =================================================

        const responseData =
            response.data;


        const cid =
            responseData?.data?.cid;


        if (
            !cid
        ) {

            throw new Error(
                "Pinata upload succeeded but no CID was returned."
            );

        }


        console.log(
            "[IPFS] Upload successful."
        );


        console.log(
            "[IPFS] CID:",
            cid
        );


        return cid;

    } catch (error) {

        const apiError =
            error.response?.data;


        console.error(
            "IPFS Upload Error:",
            apiError ||
            error.message
        );


        // =================================================
        // FRIENDLY ERROR MESSAGE
        // =================================================

        if (
            error.response?.status === 401
        ) {

            throw new Error(
                "Pinata authentication failed. Check PINATA_JWT."
            );

        }


        if (
            error.response?.status === 403
        ) {

            throw new Error(
                "Pinata rejected the upload (403). Check the API key permissions and account limits."
            );

        }


        throw new Error(

            `Failed to upload data to IPFS: ${
                apiError?.error?.message ||
                apiError?.message ||
                error.message
            }`

        );

    }

}


// =====================================================
// GET JSON DATA FROM IPFS
// =====================================================
//
// Reads public IPFS content through the configured
// Pinata gateway first, then fallback public gateways.
//
// =====================================================

async function getFromIPFS(
    cid
) {

    if (
        !cid ||
        typeof cid !== "string"
    ) {

        throw new Error(
            "A valid IPFS CID is required."
        );

    }


    const cleanCID =
        cid.trim();


    let failures =
        [];


    // =================================================
    // TRY EACH GATEWAY
    // =================================================

    for (
        const gateway
        of IPFS_GATEWAYS
    ) {

        const gatewayUrl =
            `${gateway}/${encodeURIComponent(
                cleanCID
            )}`;


        try {

            console.log(
                `\n[IPFS] Trying gateway: ${gatewayUrl}`
            );


            const response =
                await axios.get(

                    gatewayUrl,

                    {

                        timeout:
                            30000,

                        maxRedirects:
                            5,

                        headers: {

                            Accept:
                                "application/json, text/plain, */*",

                            "User-Agent":
                                "Blockchain-Grading-System/1.0"

                        },

                        validateStatus:
                            (status) =>
                                status >= 200 &&
                                status < 300

                    }

                );


            if (
                response.data !==
                    undefined &&
                response.data !==
                    null
            ) {

                console.log(
                    `[IPFS] SUCCESS: ${gatewayUrl}`
                );


                return response.data;

            }


            failures.push(

                `${gatewayUrl} -> empty response`

            );


        } catch (
            error
        ) {

            const status =
                error.response?.status;


            const detail =
                status
                    ? `HTTP ${status}`
                    : error.code ||
                      error.message;


            failures.push(

                `${gatewayUrl} -> ${detail}`

            );


            console.warn(

                `[IPFS] FAILED: ${gatewayUrl} -> ${detail}`

            );

        }

    }


    throw new Error(

        "All IPFS gateways failed.\n" +
        failures.join("\n")

    );

}


// =====================================================
// EXPORT
// =====================================================

module.exports = {

    uploadToIPFS,

    getFromIPFS

};