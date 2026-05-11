import brokenClouds from "../assets/weather-icons/basmilius/broken-clouds.svg";
import clearDay from "../assets/weather-icons/basmilius/clear-day.svg";
import clearNight from "../assets/weather-icons/basmilius/clear-night.svg";
import fewCloudsDay from "../assets/weather-icons/basmilius/few-clouds-day.svg";
import fewCloudsNight from "../assets/weather-icons/basmilius/few-clouds-night.svg";
import fog from "../assets/weather-icons/basmilius/fog.svg";
import freezingRain from "../assets/weather-icons/basmilius/freezing-rain.svg";
import hail from "../assets/weather-icons/basmilius/hail.svg";
import haze from "../assets/weather-icons/basmilius/haze.svg";
import mist from "../assets/weather-icons/basmilius/mist.svg";
import overcast from "../assets/weather-icons/basmilius/overcast.svg";
import rain from "../assets/weather-icons/basmilius/rain.svg";
import rainDay from "../assets/weather-icons/basmilius/rain-day.svg";
import rainNight from "../assets/weather-icons/basmilius/rain-night.svg";
import scatteredCloudsDay from "../assets/weather-icons/basmilius/scattered-clouds-day.svg";
import scatteredCloudsNight from "../assets/weather-icons/basmilius/scattered-clouds-night.svg";
import severeWind from "../assets/weather-icons/basmilius/severe-wind.svg";
import showersDay from "../assets/weather-icons/basmilius/showers-day.svg";
import showersNight from "../assets/weather-icons/basmilius/showers-night.svg";
import snow from "../assets/weather-icons/basmilius/snow.svg";
import snowDay from "../assets/weather-icons/basmilius/snow-day.svg";
import snowNight from "../assets/weather-icons/basmilius/snow-night.svg";
import thunderstormsRain from "../assets/weather-icons/basmilius/thunderstorms-rain.svg";
import thunderstormsSnow from "../assets/weather-icons/basmilius/thunderstorms-snow.svg";
import thunderstormDay from "../assets/weather-icons/basmilius/thunderstorm-day.svg";
import thunderstormNight from "../assets/weather-icons/basmilius/thunderstorm-night.svg";
import unknown from "../assets/weather-icons/basmilius/unknown.svg";

export const WEATHER_ICON_REGISTRY = {
  "broken-clouds": brokenClouds,
  "clear-day": clearDay,
  "clear-night": clearNight,
  "few-clouds-day": fewCloudsDay,
  "few-clouds-night": fewCloudsNight,
  fog,
  "freezing-rain": freezingRain,
  hail,
  haze,
  mist,
  overcast,
  rain,
  "rain-day": rainDay,
  "rain-night": rainNight,
  "scattered-clouds-day": scatteredCloudsDay,
  "scattered-clouds-night": scatteredCloudsNight,
  "severe-wind": severeWind,
  "showers-day": showersDay,
  "showers-night": showersNight,
  snow,
  "snow-day": snowDay,
  "snow-night": snowNight,
  "thunderstorms-rain": thunderstormsRain,
  "thunderstorms-snow": thunderstormsSnow,
  "thunderstorm-day": thunderstormDay,
  "thunderstorm-night": thunderstormNight,
  unknown
};

export function getWeatherIconSrc(iconId) {
  return WEATHER_ICON_REGISTRY[iconId] || WEATHER_ICON_REGISTRY.unknown;
}
