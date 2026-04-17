// httpClient.js
// HTTP utilities for API calls

const axios = window.axios;
axios.defaults.baseURL = '/';
axios.defaults.headers.common['Accept'] = 'application/json';

const postRequest = async (url, payloadExt) => {
  console.log("Making POST request to:", url, "with payload:", payloadExt);
  try {
    const response = await axios.post(url, new URLSearchParams(payloadExt), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      }
    });
    console.log("Response from postRequest:", response.data);
    return response.data;
  } catch (error) {
    console.log("Error in postRequest:", error);
    if (error.response && error.response.data) {
      throw error.response.data;
    }
    throw {
      error: error.response ? error.response.status : "NetworkError",
      description: error.message,
      codes: [],
      timestamp: "",
      trace_id: "",
      correlation_id: "",
    };
  }
};

const getRequest = async (url) => {
  console.log("Making GET request to:", url);
  try {
    const response = await axios.get(url, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      }
    });
    console.log("Response from getRequest:", response.data);
    return response.data;
  } catch (error) {
    console.log("Error in getRequest:", error);
    if (error.response && error.response.data) {
      throw error.response.data;
    }
    throw {
      error: error.response ? error.response.status : "NetworkError",
      description: error.message,
      codes: [],
      timestamp: "",
      trace_id: "",
      correlation_id: "",
    };
  }
};
