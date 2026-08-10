import app from "./app.js";
import dotenv from "dotenv";
import connectDB from "./db/db_connection.js";
dotenv.config({
  path: "./src/.env"
});
const PORT = process.env.PORT;
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Connection Failed : ", err);
  });

