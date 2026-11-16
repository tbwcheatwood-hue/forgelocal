const apiKey = 'YOUR_OPENWEATHERMAP_API_KEY'; // <-- replace with your key

const cityInput = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');

const weatherDisplay = document.getElementById('weather-display');
const errorMessage = document.getElementById('error-message');

const locationEl = document.getElementById('location');
const dateEl = document.getElementById('date');
const temperatureEl = document.getElementById('temperature');
const iconEl = document.getElementById('icon');
const descriptionEl = document.getElementById('description');
const humidityEl = document.getElementById('humidity');
const windSpeedEl = document.getElementById('wind-speed');

searchBtn.addEventListener('click', () => {
  const city = cityInput.value.trim();
  if (!city) return;
  fetchWeather(city);
});

async function fetchWeather(city) {
  try {
    errorMessage.classList.add('hidden');
    weatherDisplay.classList.remove('hidden');

    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
        city
      )}&units=metric&appid=${apiKey}`
    );

    if (!res.ok) throw new Error('City not found');
    const data = await res.json();

    // Populate UI
    locationEl.textContent = `${data.name}, ${data.sys.country}`;
    dateEl.textContent = new Date().toLocaleDateString();
    temperatureEl.textContent = Math.round(data.main.temp);
    iconEl.src = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
    iconEl.alt = data.weather[0].description;
    descriptionEl.textContent =
      data.weather[0].description.charAt(0).toUpperCase() +
      data.weather[0].description.slice(1);
    humidityEl.textContent = data.main.humidity;
    windSpeedEl.textContent = data.wind.speed;
  } catch (err) {
    weatherDisplay.classList.add('hidden');
    errorMessage.textContent = err.message || 'Error fetching weather';
    errorMessage.classList.remove('hidden');
  }
}