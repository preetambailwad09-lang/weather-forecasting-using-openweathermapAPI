const map = L.map('map').setView([20, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const apiKey = '25ba9b1776ffb6593c36f34fa561c2c2';
let cityBoundary = null;
let cityLabelMarker = null;
let selectedRange = 12;

document.getElementById('time-range').addEventListener('change', function () {
  selectedRange = parseInt(this.value);
});

function degToCompass(num) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(num / 22.5) % 16];
}

async function getHourlyData(lat, lon) {
  const res = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`);
  return await res.json();
}

function showPopup(lat, lon, list, title = "Hourly Forecast") {
  const labels = list.map(item => item.dt_txt.split(' ')[1].slice(0,5));
  const temps = list.map(item => item.main.temp);
  const rain = list.map(item => item.rain?.['3h'] || 0);
  const rainChance = rain.map(r => Math.min(100, Math.round((r / 4) * 100)));
  const clouds = list.map(item => item.clouds.all);
  const humidity = list.map(item => item.main.humidity);
  const pressure = list.map(item => item.main.pressure);
  const wind = list.map(item => item.wind.speed);
  const windDeg = list.map(item => item.wind.deg);

  const first = list[0];
  const firstChance = first.rain?.['3h'] ? Math.min(100, Math.round((first.rain['3h'] / 4) * 100)) : 0;
  const firstDir = first.wind?.deg ? degToCompass(first.wind.deg) : 'N/A';

  let rainChanceList = "<strong>Chance of Rain by Time:</strong><br>";
  labels.forEach((time, idx) => {
    rainChanceList += `${time}: ${rainChance[idx]}%<br>`;
  });

  const infoHTML = `
    <strong>Time:</strong> ${first.dt_txt}<br>
    <strong>Temperature:</strong> ${first.main.temp}°C<br>
    <strong>Precipitation:</strong> ${first.rain?.['3h'] || 0} mm<br>
    <strong>Chance of Rain:</strong> ${firstChance}%<br>
    <strong>Cloud Coverage:</strong> ${first.clouds.all}%<br>
    <strong>Humidity:</strong> ${first.main.humidity}%<br>
    <strong>Pressure:</strong> ${first.main.pressure} hPa<br>
    <strong>Wind:</strong> ${first.wind.speed} m/s (${firstDir})<br>
    ${rainChanceList}
    <strong>Condition:</strong> ${first.weather[0].description}
  `;

  const container = document.createElement('div');
  container.className = 'popup-chart';
  container.innerHTML = `
    <div class="popup-close" onclick="map.closePopup()">✖</div>
    <h4>${title}</h4>
    <div class="popup-info">${infoHTML}</div>
    <div class="popup-chart-controls">
      <button onclick="updateChart('temp')">🌡️ Temp</button>
      <button onclick="updateChart('rain')">🌧️ Rain</button>
      <button onclick="updateChart('rainChance')">☔ Chance</button>
      <button onclick="updateChart('clouds')">☁️ Clouds</button>
      <button onclick="updateChart('humidity')">💧 Humidity</button>
      <button onclick="updateChart('pressure')">🔵 Pressure</button>
      <button onclick="updateChart('wind')">💨 Wind</button>
    </div>
    <canvas id="popupCanvas"></canvas>
  `;

  L.popup({ maxWidth: 400, autoClose: false, closeOnClick: false })
    .setLatLng([lat, lon])
    .setContent(container)
    .openOn(map);

  const ctx = container.querySelector('#popupCanvas').getContext('2d');
  window.weatherChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Temp (°C)',
        data: temps,
        borderColor: 'orange',
        backgroundColor: 'rgba(255,165,0,0.3)',
        tension: 0.3
      }]
    },
    options: { responsive: true }
  });

  window.updateChart = function(type) {
    const sets = {
      temp: { label: 'Temp (°C)', data: temps, borderColor: 'orange' },
      rain: { label: 'Rain (mm)', data: rain, borderColor: 'blue' },
      rainChance: { label: 'Chance of Rain (%)', data: rainChance, borderColor: 'black' },
      clouds: { label: 'Clouds (%)', data: clouds, borderColor: 'gray' },
      humidity: { label: 'Humidity (%)', data: humidity, borderColor: 'green' },
      pressure: { label: 'Pressure (hPa)', data: pressure, borderColor: 'purple' },
      wind: { label: 'Wind (m/s)', data: wind, borderColor: 'brown' }
    };
    weatherChart.data.datasets = [{
      label: sets[type].label,
      data: sets[type].data,
      borderColor: sets[type].borderColor,
      backgroundColor: 'rgba(0,0,0,0.1)',
      tension: 0.3
    }];
    weatherChart.update();
  };
}

function showForecast(list, lat, lon) {
  const days = {};
  list.forEach(item => {
    const date = item.dt_txt.split(' ')[0];
    if (!days[date]) days[date] = [];
    days[date].push(item);
  });
  const forecast = document.getElementById('forecast');
  forecast.innerHTML = '';
  Object.entries(days).slice(0, 5).forEach(([date, items]) => {
    const icon = items[0].weather[0].icon;
    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.innerHTML = `
      ${date}<br>
      <img src="https://openweathermap.org/img/wn/${icon}@2x.png" width="50"><br>
      ${items[0].main.temp.toFixed(1)}°C
    `;
    card.onclick = () => showPopup(lat, lon, items.slice(0, selectedRange / 3), `Hourly for ${date}`);
    forecast.appendChild(card);
  });
}

async function showCity(city) {
  const geoRes = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${apiKey}`);
  const geoData = await geoRes.json();
  if (geoData.length > 0) {
    const { lat, lon, boundingbox } = geoData[0];
    const { list } = await getHourlyData(lat, lon);

    if (cityBoundary) map.removeLayer(cityBoundary);
    if (boundingbox) {
      const [south, north, west, east] = boundingbox.map(Number);
      cityBoundary = L.rectangle([[south, west], [north, east]], {
        color: "red", weight: 3, dashArray: "5,5", fillOpacity: 0.05
      }).addTo(map);
      map.fitBounds([[south, west], [north, east]]);
    } else {
      map.setView([lat, lon], 12);
    }

    showPopup(lat, lon, list.slice(0, selectedRange / 3), `Hourly for ${city}`);
    showForecast(list, lat, lon);
  } else {
    alert("City not found!");
  }
}

$(function() {
  $("#city-search").autocomplete({
    source: function(request, response) {
      $.getJSON(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(request.term)}&limit=5&appid=${apiKey}`, function(data) {
        response(data.map(c => ({
          label: `${c.name}, ${c.country}`,
          value: `${c.name},${c.country}`
        })));
      });
    },
    select: function(event, ui) {
      showCity(ui.item.value);
    }
  });
});

$('#search-button').click(() => {
  const city = $('#city-search').val().trim();
  if (city) showCity(city);
});

$('#city-search').keypress(e => {
  if (e.key === 'Enter') $('#search-button').click();
});

map.on('click', async e => {
  const lat = e.latlng.lat;
  const lon = e.latlng.lng;
  const reverseRes = await fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${apiKey}`);
  const reverseData = await reverseRes.json();
  const cityName = reverseData.length > 0 ? `${reverseData[0].name}, ${reverseData[0].country}` : `Lat: ${lat.toFixed(2)}, Lon: ${lon.toFixed(2)}`;

  if (cityLabelMarker) map.removeLayer(cityLabelMarker);
  cityLabelMarker = L.marker([lat, lon])
    .bindTooltip(cityName, { permanent: true, direction: 'top', offset: [0, -10] })
    .addTo(map);

  const data = await getHourlyData(lat, lon);
  showPopup(lat, lon, data.list.slice(0, selectedRange / 3), `Hourly for ${cityName}`);
  showForecast(data.list, lat, lon);
});
function loadHadoopWeather() {
    fetch("http://localhost:8000/weather.json")
    .then(res => res.json())
    .then(data => {
        console.log("Hadoop Weather Data:", data);

        document.getElementById("forecast").innerHTML = `
            <div class="forecast-card">
                <h3>${data.city}</h3>
                <p>Avg Temp: ${data.avgTemp}°C</p>
                <p>Max Wind: ${data.maxWind} km/h</p>
                <p>Wind Direction: ${data.minDirection}°</p>
            </div>
        `;
    });
}
fetch("http://localhost:5000/weather")
  .then(res => res.json())
  .then(data => {
    document.getElementById("forecast").innerHTML = `
      <div class="forecast-card">
        <h3>${data.city}</h3>
        <p>Avg Temp: ${data.avgTemp}°C</p>
        <p>Max Wind: ${data.maxWind} km/h</p>
        <p>Wind Direction: ${data.minDirection}°</p>
      </div>
    `;
  });


