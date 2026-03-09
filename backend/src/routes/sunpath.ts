import { Router, Request, Response } from 'express';
import * as SunCalc from 'suncalc';

const router = Router();

router.get('/calculate', (req: Request, res: Response) => {
  const { lat, lng, date, houseOrientation } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  const latitude = parseFloat(lat as string);
  const longitude = parseFloat(lng as string);
  const targetDate = date ? new Date(date as string) : new Date();
  const orientation = houseOrientation ? parseFloat(houseOrientation as string) : 0;

  // Calculate sun path for the given date (24 points throughout the day)
  const sunPath: Array<{ time: string; azimuth: number; altitude: number; hour: number }> = [];
  const dateCopy = new Date(targetDate);
  dateCopy.setHours(0, 0, 0, 0);

  for (let hour = 0; hour <= 24; hour++) {
    dateCopy.setHours(hour, 0, 0, 0);
    const pos = SunCalc.getPosition(dateCopy, latitude, longitude);
    sunPath.push({
      time: `${hour.toString().padStart(2, '0')}:00`,
      azimuth: (pos.azimuth * 180 / Math.PI + 180) % 360,
      altitude: pos.altitude * 180 / Math.PI,
      hour,
    });
  }

  // Get key sun times
  const times = SunCalc.getTimes(targetDate, latitude, longitude);

  // Calculate sun positions for key times of year
  const summerSolstice = new Date(targetDate.getFullYear(), 5, 21); // June 21
  const winterSolstice = new Date(targetDate.getFullYear(), 11, 21); // Dec 21
  const springEquinox = new Date(targetDate.getFullYear(), 2, 20); // Mar 20

  const summerPath = getSunPathForDay(summerSolstice, latitude, longitude);
  const winterPath = getSunPathForDay(winterSolstice, latitude, longitude);
  const equinoxPath = getSunPathForDay(springEquinox, latitude, longitude);

  // Calculate shade zones relative to house orientation
  const maxAltitude = Math.max(...sunPath.filter(p => p.altitude > 0).map(p => p.altitude));
  const sunriseTime = times.sunrise;
  const sunsetTime = times.sunset;

  // Determine full sun hours (>6 hrs direct sun), part shade (3-6 hrs), shade (<3 hrs)
  const sunHoursToday = sunPath.filter(p => p.altitude > 10).length;

  res.json({
    location: { lat: latitude, lng: longitude },
    date: targetDate.toISOString(),
    houseOrientation: orientation,
    sunTimes: {
      sunrise: times.sunrise?.toISOString(),
      sunset: times.sunset?.toISOString(),
      solarNoon: times.solarNoon?.toISOString(),
      goldenHourMorning: times.goldenHour?.toISOString(),
      goldenHourEvening: times.goldenHourEnd?.toISOString(),
    },
    sunPath,
    seasonalPaths: {
      summer: summerPath,
      winter: winterPath,
      equinox: equinoxPath,
    },
    sunExposure: {
      hoursOfSun: sunHoursToday,
      classification: sunHoursToday >= 6 ? 'full-sun' : sunHoursToday >= 3 ? 'part-shade' : 'full-shade',
      maxAltitude,
    },
  });
});

function getSunPathForDay(date: Date, lat: number, lng: number) {
  const path = [];
  const dateCopy = new Date(date);
  dateCopy.setHours(0, 0, 0, 0);

  for (let hour = 5; hour <= 20; hour++) {
    dateCopy.setHours(hour, 0, 0, 0);
    const pos = SunCalc.getPosition(dateCopy, lat, lng);
    const altitude = pos.altitude * 180 / Math.PI;
    if (altitude > 0) {
      path.push({
        hour,
        azimuth: (pos.azimuth * 180 / Math.PI + 180) % 360,
        altitude,
      });
    }
  }
  return path;
}

export default router;
