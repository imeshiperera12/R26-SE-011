const dotenv = require("dotenv");

dotenv.config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const resultRoutes = require("./routes/resultRoutes");
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const importRoutes = require("./routes/importRoutes");
const exportRoutes = require("./routes/exportRoutes");
const specialConcernRoutes = require("./routes/specialConcernRoutes");

const { startFinalizationJob } = require("./jobs/finalizationJob");
const { startBlockchainJob } = require("./jobs/blockchainJob");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api", resultRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", dashboardRoutes);
app.use("/api", importRoutes);
app.use("/api", exportRoutes);
app.use("/api", specialConcernRoutes);

// Test Route
app.get("/", (req, res) => {
  res.status(200).send("Component 2 Backend Running");
});

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");

    // Start automatic jobs
    startFinalizationJob();
    startBlockchainJob();
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

// Start Server
const PORT = process.env.PORT || 5001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
