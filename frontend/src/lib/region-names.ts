/* --------------------------------------------------------------------------
   State / province names for the sign-up rules' search (P1-ART-17), by ISO
   3166-2 subdivision code. The browser names countries itself
   (Intl.DisplayNames) but not their subdivisions, so the countries most
   likely to carry per-state ages ship their names here. A code with no name
   here is still searchable by its code — this list only adds names.
   -------------------------------------------------------------------------- */

/** Every ISO 3166-1 alpha-2 country / territory code — the "Add a place"
 *  dropdown lists exactly these (named by the browser), so no made-up code
 *  ("XYZ") can be saved. */
export const COUNTRY_CODES: readonly string[] = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY",
  "HK", "HM", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY",
  "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ",
  "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ",
  "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW",
];

export const REGION_NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  US: {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
    DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
    IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
    MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
    NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
    NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
    RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
    VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
    PR: "Puerto Rico", GU: "Guam", VI: "U.S. Virgin Islands", AS: "American Samoa", MP: "Northern Mariana Islands",
  },
  CA: {
    AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador",
    NS: "Nova Scotia", NT: "Northwest Territories", NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island",
    QC: "Quebec", SK: "Saskatchewan", YT: "Yukon",
  },
  MX: {
    AGU: "Aguascalientes", BCN: "Baja California", BCS: "Baja California Sur", CAM: "Campeche", CHP: "Chiapas",
    CHH: "Chihuahua", CMX: "Mexico City", COA: "Coahuila", COL: "Colima", DUR: "Durango", GUA: "Guanajuato",
    GRO: "Guerrero", HID: "Hidalgo", JAL: "Jalisco", MEX: "State of Mexico", MIC: "Michoacán", MOR: "Morelos",
    NAY: "Nayarit", NLE: "Nuevo León", OAX: "Oaxaca", PUE: "Puebla", QUE: "Querétaro", ROO: "Quintana Roo",
    SLP: "San Luis Potosí", SIN: "Sinaloa", SON: "Sonora", TAB: "Tabasco", TAM: "Tamaulipas", TLA: "Tlaxcala",
    VER: "Veracruz", YUC: "Yucatán", ZAC: "Zacatecas",
  },
  AU: {
    ACT: "Australian Capital Territory", NSW: "New South Wales", NT: "Northern Territory", QLD: "Queensland",
    SA: "South Australia", TAS: "Tasmania", VIC: "Victoria", WA: "Western Australia",
  },
  BR: {
    AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
    ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
    MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
    RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
    SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
  },
  IN: {
    AN: "Andaman and Nicobar Islands", AP: "Andhra Pradesh", AR: "Arunachal Pradesh", AS: "Assam", BR: "Bihar",
    CH: "Chandigarh", CT: "Chhattisgarh", DH: "Dadra and Nagar Haveli and Daman and Diu", DL: "Delhi", GA: "Goa",
    GJ: "Gujarat", HR: "Haryana", HP: "Himachal Pradesh", JK: "Jammu and Kashmir", JH: "Jharkhand",
    KA: "Karnataka", KL: "Kerala", LA: "Ladakh", LD: "Lakshadweep", MP: "Madhya Pradesh", MH: "Maharashtra",
    MN: "Manipur", ML: "Meghalaya", MZ: "Mizoram", NL: "Nagaland", OR: "Odisha", PY: "Puducherry", PB: "Punjab",
    RJ: "Rajasthan", SK: "Sikkim", TN: "Tamil Nadu", TG: "Telangana", TR: "Tripura", UP: "Uttar Pradesh",
    UT: "Uttarakhand", WB: "West Bengal",
  },
};
