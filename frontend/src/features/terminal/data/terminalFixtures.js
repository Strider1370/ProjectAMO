import { normalizeTerminalFlight } from '../model/terminalDisplayModel.js'

const weather = (current, preArrival, arrival, afterArrival) => ({ current, preArrival, arrival, afterArrival })

const rawGroups = [
  [
    {
      id: 'JL92-HND-0930',
      destination: { city: '도쿄', airportName: '하네다 국제공항', displayName: '도쿄 하네다', code: 'HND', timezone: 'JST' },
      airline: { name: 'Japan Airlines', flightNumber: 'JL92', logoKey: 'jal' },
      operation: { status: '정시 운항', tone: 'ok', departure: '09:30', revisedDeparture: null, duration: '02:10', gate: '32' },
      clocks: { destinationNow: '09:15', destinationDate: '7/30', koreaNow: '09:15', arrivalLocal: '11:25', arrivalKorea: '11:25', arrivalKoreaDayOffset: 0 },
      weather: weather(
        { time: '09:15', type: 'rain', temperature: 27, feelsLike: 31, humidity: 78, wind: '남서 6m/s' },
        { time: '10:00', type: 'cloudy', temperature: 27 }, { time: '12:00', type: 'partly', temperature: 28 },
        [{ time: '14:00', type: 'cloudy', temperature: 29 }, { time: '16:00', type: 'cloudy', temperature: 28 }, { time: '18:00', type: 'partly', temperature: 27 }, { time: '20:00', type: 'cloudy', temperature: 26 }],
      ), dataState: { phase: 'ready', updatedAtKorea: '09:30', hasNextPage: true },
    },
    {
      id: 'SQ607-SIN-1025', destination: { city: '싱가포르', airportName: '창이 국제공항', displayName: '싱가포르', code: 'SIN', timezone: 'SGT' }, airline: { name: 'Singapore Airlines', flightNumber: 'SQ607', logoKey: 'sq' },
      operation: { status: '정시 운항', tone: 'ok', departure: '10:25', revisedDeparture: null, duration: '06:40', gate: '25' }, clocks: { destinationNow: '08:15', destinationDate: '7/30', koreaNow: '09:15', arrivalLocal: '16:05', arrivalKorea: '17:05', arrivalKoreaDayOffset: 0 },
      weather: weather({ time: '08:15', type: 'partly', temperature: 31, feelsLike: 36, humidity: 69, wind: '남동 4m/s' }, { time: '15:00', type: 'cloudy', temperature: 29 }, { time: '16:00', type: 'rain', temperature: 28 }, [{ time: '18:00', type: 'storm', temperature: 27 }, { time: '20:00', type: 'cloudy', temperature: 27 }, { time: '22:00', type: 'rain', temperature: 26 }, { time: '00:00', type: 'cloudy', temperature: 26 }]), dataState: { phase: 'ready', updatedAtKorea: '09:30', hasNextPage: true },
    },
    {
      id: 'AF267-CDG-1105', destination: { city: '파리', airportName: '샤를 드골 국제공항', displayName: '파리 샤를 드 골', code: 'CDG', timezone: 'CEST' }, airline: { name: 'Air France', flightNumber: 'AF267', logoKey: 'af' },
      operation: { status: '지연 20분', tone: 'delay', departure: '11:05', revisedDeparture: '11:25', duration: '13:45', gate: '12' }, clocks: { destinationNow: '02:15', destinationDate: '7/30', koreaNow: '09:15', arrivalLocal: '18:50', arrivalKorea: '01:50', arrivalKoreaDayOffset: 1 },
      weather: weather({ time: '02:15', type: 'cloudy', temperature: 20, feelsLike: 20, humidity: 62, wind: '북동 3m/s' }, { time: '18:00', type: 'partly', temperature: 20 }, { time: '19:00', type: 'partly', temperature: 20 }, [{ time: '21:00', type: 'mostlyCloudy', temperature: 18 }, { time: '23:00', type: 'clear', temperature: 17 }, { time: '01:00', type: 'clear', temperature: 16 }, { time: '03:00', type: 'cloudy', temperature: 16 }]), dataState: { phase: 'ready', updatedAtKorea: '09:30', hasNextPage: true },
    },
  ],
  [
    {
      id: 'JL120-KIX-1020', destination: { city: '오사카', airportName: '간사이 국제공항', displayName: '오사카 간사이', code: 'KIX', timezone: 'JST' }, airline: { name: 'Japan Airlines', flightNumber: 'JL120', logoKey: 'jal' },
      operation: { status: '정시 운항', tone: 'ok', departure: '10:20', revisedDeparture: null, duration: '01:45', gate: '18' }, clocks: { destinationNow: '09:15', destinationDate: '7/30', koreaNow: '09:15', arrivalLocal: '12:05', arrivalKorea: '12:05', arrivalKoreaDayOffset: 0 },
      weather: weather({ time: '09:15', type: 'partly', temperature: 26, feelsLike: 28, humidity: 65, wind: '남서 3m/s' }, { time: '11:00', type: 'cloudy', temperature: 26 }, { time: '12:00', type: 'partly', temperature: 26 }, [{ time: '14:00', type: 'cloudy', temperature: 27 }, { time: '16:00', type: 'rain', temperature: 25 }, { time: '18:00', type: 'cloudy', temperature: 24 }, { time: '20:00', type: 'cloudy', temperature: 23 }]), dataState: { phase: 'ready', updatedAtKorea: '09:30', hasNextPage: false },
    },
    {
      id: 'SQ711-BKK-1055', destination: { city: '방콕', airportName: '수완나품 국제공항', displayName: '방콕 수완나품', code: 'BKK', timezone: 'ICT' }, airline: { name: 'Singapore Airlines', flightNumber: 'SQ711', logoKey: 'sq' },
      operation: { status: '탑승 준비', tone: 'ok', departure: '10:55', revisedDeparture: null, duration: '06:15', gate: '26' }, clocks: { destinationNow: '07:15', destinationDate: '7/30', koreaNow: '09:15', arrivalLocal: '15:10', arrivalKorea: '17:10', arrivalKoreaDayOffset: 0 },
      weather: weather({ time: '07:15', type: 'rain', temperature: 30, feelsLike: 35, humidity: 74, wind: '남동 2m/s' }, { time: '14:00', type: 'rain', temperature: 30 }, { time: '15:00', type: 'rain', temperature: 30 }, [{ time: '17:00', type: 'storm', temperature: 29 }, { time: '19:00', type: 'cloudy', temperature: 28 }, { time: '21:00', type: 'rain', temperature: 27 }, { time: '23:00', type: 'cloudy', temperature: 27 }]), dataState: { phase: 'ready', updatedAtKorea: '09:30', hasNextPage: false },
    },
    {
      id: 'AF140-FCO-1130', destination: { city: '로마', airportName: '레오나르도 다 빈치 국제공항', displayName: '로마 피우미치노', code: 'FCO', timezone: 'CEST' }, airline: { name: 'Air France', flightNumber: 'AF140', logoKey: 'af' },
      operation: { status: '정시 운항', tone: 'ok', departure: '11:30', revisedDeparture: null, duration: '13:55', gate: '34' }, clocks: { destinationNow: '02:15', destinationDate: '7/30', koreaNow: '09:15', arrivalLocal: '18:25', arrivalKorea: '01:25', arrivalKoreaDayOffset: 1 },
      weather: weather({ time: '02:15', type: 'clear', temperature: 24, feelsLike: 25, humidity: 58, wind: '서풍 3m/s' }, { time: '17:00', type: 'partly', temperature: 24 }, { time: '18:00', type: 'partly', temperature: 24 }, [{ time: '20:00', type: 'partly', temperature: 23 }, { time: '22:00', type: 'mostlyCloudy', temperature: 22 }, { time: '00:00', type: 'partly', temperature: 20 }, { time: '02:00', type: 'clear', temperature: 19 }]), dataState: { phase: 'ready', updatedAtKorea: '09:30', hasNextPage: false },
    },
  ],
]

export const TERMINAL_FLIGHT_GROUPS = Object.freeze(rawGroups.map((group) => Object.freeze(group.map(normalizeTerminalFlight))))
