import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';

const TimezoneContext = createContext('UTC');

type DateLike = Date | string | number;

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezone] = useState('UTC');

  useEffect(() => {
    api.get<{ timezone: string }>('/api/config')
      .then((config) => {
        if (config.timezone) {
          setTimezone(config.timezone);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <TimezoneContext.Provider value={timezone}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone() {
  return useContext(TimezoneContext);
}

export function formatDate(value: DateLike, timezone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: timezone }).format(toDate(value));
}

export function formatTime(value: DateLike, timezone: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    ...options,
    timeZone: timezone,
  }).format(toDate(value));
}

export function getDateKey(value: DateLike, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).formatToParts(toDate(value));

  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function getHour(value: DateLike, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: timezone,
  }).formatToParts(toDate(value));

  return Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
}

export function getDateParts(value: DateLike, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: timezone,
  }).formatToParts(toDate(value));

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value ?? '0'),
    month: Number(parts.find((part) => part.type === 'month')?.value ?? '1'),
    day: Number(parts.find((part) => part.type === 'day')?.value ?? '1'),
  };
}

export function todayInTimezone(timezone: string) {
  return fromDateKey(getDateKey(new Date(), timezone), timezone);
}

export function fromDateKey(dateKey: string, timezone: string, hour = 12) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return makeZonedDate(year, month, day, timezone, hour);
}

export function addDaysInTimezone(value: DateLike, days: number, timezone: string) {
  const { year, month, day } = getDateParts(value, timezone);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12));
  return fromDateKey(getDateKey(shifted, 'UTC'), timezone);
}

export function addMonthsInTimezone(value: DateLike, months: number, timezone: string) {
  const { year, month, day } = getDateParts(value, timezone);
  const shifted = new Date(Date.UTC(year, month - 1 + months, day, 12));
  return fromDateKey(getDateKey(shifted, 'UTC'), timezone);
}

export function startOfDayInTimezone(value: DateLike, timezone: string) {
  const { year, month, day } = getDateParts(value, timezone);
  return makeZonedDate(year, month, day, timezone, 0, 0, 0, 0);
}

export function endOfDayInTimezone(value: DateLike, timezone: string) {
  const { year, month, day } = getDateParts(value, timezone);
  return makeZonedDate(year, month, day, timezone, 23, 59, 59, 999);
}

export function startOfWeekInTimezone(value: DateLike, timezone: string) {
  const weekday = getWeekdayIndex(value, timezone);
  return startOfDayInTimezone(addDaysInTimezone(value, -weekday, timezone), timezone);
}

export function endOfWeekInTimezone(value: DateLike, timezone: string) {
  return endOfDayInTimezone(addDaysInTimezone(startOfWeekInTimezone(value, timezone), 6, timezone), timezone);
}

export function startOfMonthInTimezone(value: DateLike, timezone: string) {
  const { year, month } = getDateParts(value, timezone);
  return makeZonedDate(year, month, 1, timezone, 0, 0, 0, 0);
}

export function endOfMonthInTimezone(value: DateLike, timezone: string) {
  const nextMonthStart = startOfMonthInTimezone(addMonthsInTimezone(value, 1, timezone), timezone);
  return new Date(nextMonthStart.getTime() - 1);
}

export function makeZonedDate(year: number, month: number, day: number, timezone: string, hour = 12, minute = 0, second = 0, millisecond = 0) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcGuess), timezone);
  return new Date(utcGuess - offsetMinutes * 60_000);
}

function getWeekdayIndex(value: DateLike, timezone: string) {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone }).format(toDate(value));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return Math.max(0, days.indexOf(weekday));
}

function getTimeZoneOffsetMinutes(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
  }).formatToParts(value);
  const offset = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+0';
  const match = offset.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? '0');
  return sign * (hours * 60 + minutes);
}

function toDate(value: DateLike) {
  return value instanceof Date ? value : new Date(value);
}
