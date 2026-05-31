export interface BirthData {
  name: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  tzOffset: number;
  birthplace: {
    label: string;
    lat: number;
    lng: number;
  };
}

export const TEST_BIRTH: BirthData = {
  name: 'Albert Einstein',
  year: 1879,
  month: 3,
  day: 14,
  hour: 11,
  minute: 30,
  tzOffset: 0.6166666666666667,
  birthplace: {
    label: 'Ulm, Germany',
    lat: 48.4011,
    lng: 9.9876,
  },
};

// The charts a fresh install starts with, in display order; the first is the
// selected one. Einstein doubles as a ready-made synastry partner.
export const SEED_BIRTHS: BirthData[] = [
  {
    name: 'Leonardo DiCaprio',
    year: 1974,
    month: 11,
    day: 11,
    hour: 2,
    minute: 47,
    tzOffset: -8,
    birthplace: {
      label: 'Los Angeles, California, United States',
      lat: 34.0522,
      lng: -118.2437,
    },
  },
  TEST_BIRTH,
];
