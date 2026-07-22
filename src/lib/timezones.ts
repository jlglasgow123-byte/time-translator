export interface TimezoneOption {
  label: string
  value: string
}

export interface TimezoneGroup {
  group: string
  options: TimezoneOption[]
}

export const TIMEZONE_GROUPS: TimezoneGroup[] = [
  {
    group: 'Australia',
    options: [
      { label: 'Sydney / Melbourne / Canberra (AEST)', value: 'Australia/Sydney' },
      { label: 'Brisbane (AEST, no DST)', value: 'Australia/Brisbane' },
      { label: 'Adelaide (ACST)', value: 'Australia/Adelaide' },
      { label: 'Darwin (ACST, no DST)', value: 'Australia/Darwin' },
      { label: 'Perth (AWST)', value: 'Australia/Perth' },
      { label: 'Hobart (AEST)', value: 'Australia/Hobart' },
      { label: 'Lord Howe Island', value: 'Australia/Lord_Howe' },
    ],
  },
  {
    group: 'Pacific',
    options: [
      { label: 'Auckland / Wellington (NZST)', value: 'Pacific/Auckland' },
      { label: 'Fiji', value: 'Pacific/Fiji' },
      { label: 'Honolulu (Hawaii)', value: 'Pacific/Honolulu' },
      { label: 'Guam', value: 'Pacific/Guam' },
      { label: 'Port Moresby (PNG)', value: 'Pacific/Port_Moresby' },
    ],
  },
  {
    group: 'Asia',
    options: [
      { label: 'Tokyo (JST)', value: 'Asia/Tokyo' },
      { label: 'Shanghai / Beijing (CST)', value: 'Asia/Shanghai' },
      { label: 'Hong Kong', value: 'Asia/Hong_Kong' },
      { label: 'Singapore', value: 'Asia/Singapore' },
      { label: 'Kuala Lumpur', value: 'Asia/Kuala_Lumpur' },
      { label: 'Jakarta (WIB)', value: 'Asia/Jakarta' },
      { label: 'Bangkok (ICT)', value: 'Asia/Bangkok' },
      { label: 'Yangon (MMT)', value: 'Asia/Yangon' },
      { label: 'Dhaka (BST)', value: 'Asia/Dhaka' },
      { label: 'Kolkata / Mumbai (IST)', value: 'Asia/Kolkata' },
      { label: 'Kathmandu (NPT)', value: 'Asia/Kathmandu' },
      { label: 'Colombo (SLST)', value: 'Asia/Colombo' },
      { label: 'Karachi (PKT)', value: 'Asia/Karachi' },
      { label: 'Tashkent (UZT)', value: 'Asia/Tashkent' },
      { label: 'Kabul (AFT)', value: 'Asia/Kabul' },
      { label: 'Dubai (GST)', value: 'Asia/Dubai' },
      { label: 'Riyadh (AST)', value: 'Asia/Riyadh' },
      { label: 'Tehran (IRST)', value: 'Asia/Tehran' },
      { label: 'Baku (AZT)', value: 'Asia/Baku' },
      { label: 'Tbilisi (GET)', value: 'Asia/Tbilisi' },
      { label: 'Yerevan (AMT)', value: 'Asia/Yerevan' },
      { label: 'Beirut (EET)', value: 'Asia/Beirut' },
      { label: 'Jerusalem (IST)', value: 'Asia/Jerusalem' },
      { label: 'Seoul (KST)', value: 'Asia/Seoul' },
      { label: 'Taipei', value: 'Asia/Taipei' },
      { label: 'Manila', value: 'Asia/Manila' },
      { label: 'Ulaanbaatar', value: 'Asia/Ulaanbaatar' },
    ],
  },
  {
    group: 'Europe',
    options: [
      { label: 'London (GMT/BST)', value: 'Europe/London' },
      { label: 'Dublin (GMT/IST)', value: 'Europe/Dublin' },
      { label: 'Lisbon (WET)', value: 'Europe/Lisbon' },
      { label: 'Paris / Berlin / Rome (CET)', value: 'Europe/Paris' },
      { label: 'Amsterdam', value: 'Europe/Amsterdam' },
      { label: 'Brussels', value: 'Europe/Brussels' },
      { label: 'Madrid', value: 'Europe/Madrid' },
      { label: 'Zurich', value: 'Europe/Zurich' },
      { label: 'Stockholm', value: 'Europe/Stockholm' },
      { label: 'Oslo', value: 'Europe/Oslo' },
      { label: 'Copenhagen', value: 'Europe/Copenhagen' },
      { label: 'Helsinki (EET)', value: 'Europe/Helsinki' },
      { label: 'Athens (EET)', value: 'Europe/Athens' },
      { label: 'Bucharest (EET)', value: 'Europe/Bucharest' },
      { label: 'Warsaw', value: 'Europe/Warsaw' },
      { label: 'Prague', value: 'Europe/Prague' },
      { label: 'Vienna', value: 'Europe/Vienna' },
      { label: 'Budapest', value: 'Europe/Budapest' },
      { label: 'Kiev (EET)', value: 'Europe/Kiev' },
      { label: 'Minsk (FET)', value: 'Europe/Minsk' },
      { label: 'Moscow (MSK)', value: 'Europe/Moscow' },
      { label: 'Istanbul (TRT)', value: 'Europe/Istanbul' },
    ],
  },
  {
    group: 'Africa',
    options: [
      { label: 'Cairo (EET)', value: 'Africa/Cairo' },
      { label: 'Johannesburg (SAST)', value: 'Africa/Johannesburg' },
      { label: 'Nairobi (EAT)', value: 'Africa/Nairobi' },
      { label: 'Lagos (WAT)', value: 'Africa/Lagos' },
      { label: 'Accra (GMT)', value: 'Africa/Accra' },
      { label: 'Casablanca (WET)', value: 'Africa/Casablanca' },
      { label: 'Addis Ababa (EAT)', value: 'Africa/Addis_Ababa' },
    ],
  },
  {
    group: 'Americas — North',
    options: [
      { label: 'New York (EST/EDT)', value: 'America/New_York' },
      { label: 'Chicago (CST/CDT)', value: 'America/Chicago' },
      { label: 'Denver (MST/MDT)', value: 'America/Denver' },
      { label: 'Phoenix (MST, no DST)', value: 'America/Phoenix' },
      { label: 'Los Angeles (PST/PDT)', value: 'America/Los_Angeles' },
      { label: 'Anchorage (AKST)', value: 'America/Anchorage' },
      { label: 'Toronto (EST/EDT)', value: 'America/Toronto' },
      { label: 'Vancouver (PST/PDT)', value: 'America/Vancouver' },
      { label: 'Winnipeg (CST/CDT)', value: 'America/Winnipeg' },
      { label: 'Halifax (AST/ADT)', value: 'America/Halifax' },
      { label: 'St. Johns (NST)', value: 'America/St_Johns' },
      { label: 'Mexico City (CST/CDT)', value: 'America/Mexico_City' },
    ],
  },
  {
    group: 'Americas — South & Caribbean',
    options: [
      { label: 'São Paulo (BRT)', value: 'America/Sao_Paulo' },
      { label: 'Buenos Aires (ART)', value: 'America/Argentina/Buenos_Aires' },
      { label: 'Santiago (CLT)', value: 'America/Santiago' },
      { label: 'Bogotá (COT)', value: 'America/Bogota' },
      { label: 'Lima (PET)', value: 'America/Lima' },
      { label: 'Caracas (VET)', value: 'America/Caracas' },
      { label: 'La Paz (BOT)', value: 'America/La_Paz' },
      { label: 'Asunción (PYT)', value: 'America/Asuncion' },
      { label: 'Panama (EST)', value: 'America/Panama' },
      { label: 'Jamaica (EST)', value: 'America/Jamaica' },
    ],
  },
  {
    group: 'UTC / Other',
    options: [
      { label: 'UTC', value: 'UTC' },
      { label: 'Reykjavik (GMT)', value: 'Atlantic/Reykjavik' },
      { label: 'Cape Verde (CVT)', value: 'Atlantic/Cape_Verde' },
      { label: 'Azores (AZOT)', value: 'Atlantic/Azores' },
    ],
  },
]

export const ALL_TIMEZONES: TimezoneOption[] = TIMEZONE_GROUPS.flatMap(g => g.options)
