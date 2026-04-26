const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const resultRoutes = require("./routes/resultRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

app.use("/api", resultRoutes);

// MongoDB Connection
mongoose.connect("mongodb://127.0.0.1:27017/boa_revision")
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

// Test Route
app.get("/", (req, res) => {
  res.send("Component 2 Backend Running");
});

// Start Server
app.listen(5000, () => {
  console.log("Server running on port 5000");
});