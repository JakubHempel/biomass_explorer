# 🛰️ BioMap Explorer Pro

**BioMap Explorer Pro** is a high-performance analytical microservice that integrates **Sentinel-2** satellite data with the power of **Google Earth Engine (GEE)**. This tool allows for precision monitoring of crop health by calculating 9 key vegetation indices in real-time.

---

## 🚀 Key Features

* **9 Advanced Spectral Indices:** Comprehensive analysis of plant vigor, chlorophyll content, moisture levels, and soil influence.
* **Smart Time-Series Engine:** Automatically filters cloud cover and retrieves the best available imagery for any selected Area of Interest (AOI).
* **Interactive GIS Dashboard:** A dynamic map featuring live legends, mathematical formulas, a minimap, and comprehensive layer control.
* **Dynamic Legend & UI:** Professional legend panel that updates in real-time based on the selected layer.
* **One-Click Focus:** Instant zoom-to-AOI functionality to quickly center your view on the field.

---

## 🧮 Scientific Background

The system leverages Sentinel-2's multi-spectral bands (from B2 Blue to B11 SWIR) to calculate indices essential for precision farming:

| Index | Name | Primary Use | Formula |
| :--- | :--- | :--- | :--- |
| **NDVI** | Normalized Difference Veg. Index | General biomass and plant vigor assessment. | $$NDVI = \frac{NIR - Red}{NIR + Red}$$ |
| **GNDVI** | Green NDVI | Chlorophyll content detection; better for late-stage crops. | $$GNDVI = \frac{NIR - Green}{NIR + Green}$$ |
| **EVI** | Enhanced Veg. Index | Atmospheric resistance; ideal for high-biomass regions. | $$EVI = 2.5 \times \frac{NIR - Red}{NIR + 6 \times Red - 7.5 \times Blue + 1}$$ |
| **MSAVI2** | Modified Soil Adj. Veg. Index | Best for early growth stages with high bare-soil exposure. | $$\frac{(2 \times NIR + 1) - \sqrt{(2 \times NIR + 1)^2 - 8 \times (NIR - Red)}}{2}$$ |
| **NDWI** | Normalized Difference Water Index | Monitoring leaf water content and drought stress. | $$NDWI = \frac{Green - NIR}{Green + NIR}$$ |
| **NDRE** | Normalized Difference Red Edge | Nitrogen management and early stress detection. | $$NDRE = \frac{NIR - RedEdge}{NIR + RedEdge}$$ |
| **REIP** | Red Edge Inflexion Point | Tracks spectral shifts (in nm) to detect subtle physiological changes in plants. | $$REIP = 700 + 40 \times \frac{\frac{Red + RE3}{2} - RE1}{RE2 - RE1}$$ |

---

## 🛠️ Setup & Installation

This project uses **Interactive Web Authentication**.

### 1. Prerequisites
* A registered [Google Earth Engine](https://earthengine.google.com/) account.
* An active Google Cloud Project (note your **Project ID**).

### 2. Configuration
Create a `.env` file in the root directory of the project to store your configuration:
```text
GEE_PROJECT_ID='your-google-cloud-project-id'
```

### 3. Installation
1.  **Clone the repository** and navigate to the project folder.
2.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
3.  **Run the Backend:**
    ```bash
    uvicorn main:app --reload
    ```
4.  **First-time Auth:** Upon the first run, the console will provide a link. Open it in your browser, log in with your Google account, and follow the instructions to grant GEE access. The system will store a local token for future sessions.

### 4. Launching the Frontend
Simply open `http://127.0.0.1:8000` in any modern web browser to start exploring your fields. No additional web server is needed for the frontend.

---

### 📝 License
This project is open-source. Feel free to use and modify it for your own agricultural or research applications.