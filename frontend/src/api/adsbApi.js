export async function fetchAdsbData() {
  try {
    const response = await fetch('/api/adsb');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch ADS-B data:', error);
    return null;
  }
}
