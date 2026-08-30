import axios from "axios";
import { getToken } from "../utils/auth";

const API = `${process.env.REACT_APP_API_URL}/api`;

export const getFinalizedResults = async () => {
  const response = await axios.get(`${API}/final-results`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });

  return response.data;
};
