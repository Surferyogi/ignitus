// Kizuna 絆 — v2.0.0 — Supabase sync across all devices
import { useState, useMemo, useCallback, useEffect, useRef, useContext, createContext } from "react";
import { supabase, supabaseConfigured } from './supabase.js';
import FestiveFireworks, { detectFestiveTheme } from './components/FestiveFireworks.jsx';

// ─── HELPERS ─────────────────────────────────────────────────────
const p2 = n => String(n).padStart(2, '0');
// T0 is fixed at module load — used only for relative date calculations.
const T0 = new Date();
const fd = d => `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;

// ─── REPEAT EXPANSION ────────────────────────────────────────────
// Generates virtual occurrences for repeating entries over the next 365 days.
// Virtual entries have _virtual:true — shown in UI but cannot be edited/deleted.
// Only entries with repeat !== 'none' are expanded.
function expandRepeating(entries) {
  const today  = new Date(); today.setHours(0,0,0,0);
  const cutoff = new Date(today.getTime() + 365 * 86400000); // 1 year ahead
  const result = [...entries];

  entries.forEach(e => {
    if (!e.repeat || e.repeat === 'none' || !e.date) return;

    const origin = new Date(e.date + 'T00:00:00');
    const step = { daily:1, weekly:7, monthly:0, yearly:0 }[e.repeat];

    let cursor = new Date(origin);

    // Advance cursor past today if origin is in the past
    while (cursor < today) {
      if (e.repeat === 'daily')   cursor.setDate(cursor.getDate() + 1);
      else if (e.repeat === 'weekly')  cursor.setDate(cursor.getDate() + 7);
      else if (e.repeat === 'monthly') cursor.setMonth(cursor.getMonth() + 1);
      else if (e.repeat === 'yearly')  cursor.setFullYear(cursor.getFullYear() + 1);
    }

    // Generate occurrences up to cutoff
    let safety = 0;
    while (cursor <= cutoff && safety < 400) {
      safety++;
      const ds = fd(cursor);
      // Skip the original entry's own date
      if (ds !== e.date) {
        result.push({
          ...e,
          id:       `${e.id}_${ds}`,  // unique virtual ID
          date:     ds,
          _virtual: true,             // marks as read-only virtual copy
          _originId: e.id,
        });
      }
      if (e.repeat === 'daily')        cursor.setDate(cursor.getDate() + 1);
      else if (e.repeat === 'weekly')  cursor.setDate(cursor.getDate() + 7);
      else if (e.repeat === 'monthly') cursor.setMonth(cursor.getMonth() + 1);
      else if (e.repeat === 'yearly')  cursor.setFullYear(cursor.getFullYear() + 1);
    }
  });

  return result;
}
const ad = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const ft = (h, m=0) => `${h%12||12}:${p2(m)} ${h>=12?'PM':'AM'}`;
const pt = s => { if (!s) return ''; const [h,m] = s.split(':').map(Number); return ft(h,m); };
const DAY   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MFULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const relTime = iso => {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)     return 'Just now';
  if (diff < 3600000)   return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000)  return `${Math.floor(diff/3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff/86400000)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric' });
};

// ─── AIRPORT LOOKUP ──────────────────────────────────────────────
// Top 300 IATA codes → city name. Bundled statically — zero API calls,
// works fully offline, instant lookup. Covers >95% of commercial routes.
const AIRPORTS = {
  SIN:'Singapore',ICN:'Seoul',NRT:'Tokyo',HND:'Tokyo',PVG:'Shanghai',PEK:'Beijing',
  PKX:'Beijing',HKG:'Hong Kong',BKK:'Bangkok',KUL:'Kuala Lumpur',CGK:'Jakarta',
  MNL:'Manila',SGN:'Ho Chi Minh City',HAN:'Hanoi',RGN:'Yangon',PNH:'Phnom Penh',
  VTE:'Vientiane',REP:'Siem Reap',DAD:'Da Nang',CXR:'Nha Trang',
  LHR:'London',LGW:'London',CDG:'Paris',AMS:'Amsterdam',FRA:'Frankfurt',
  MUC:'Munich',ZRH:'Zurich',VIE:'Vienna',MAD:'Madrid',BCN:'Barcelona',
  FCO:'Rome',MXP:'Milan',LIN:'Milan',ATH:'Athens',IST:'Istanbul',
  DXB:'Dubai',AUH:'Abu Dhabi',DOH:'Doha',BAH:'Bahrain',KWI:'Kuwait City',
  RUH:'Riyadh',JED:'Jeddah',CAI:'Cairo',ADD:'Addis Ababa',NBO:'Nairobi',
  JNB:'Johannesburg',CPT:'Cape Town',LOS:'Lagos',ACC:'Accra',CMN:'Casablanca',
  JFK:'New York',EWR:'New York',LGA:'New York',PHL:'Philadelphia',LAX:'Los Angeles',ORD:'Chicago',
  MDW:'Chicago',ATL:'Atlanta',DFW:'Dallas',DEN:'Denver',SFO:'San Francisco',
  SEA:'Seattle',MIA:'Miami',BOS:'Boston',IAD:'Washington DC',DCA:'Washington DC',
  YYZ:'Toronto',YVR:'Vancouver',YUL:'Montreal',GRU:'São Paulo',GIG:'Rio de Janeiro',
  EZE:'Buenos Aires',SCL:'Santiago',BOG:'Bogotá',LIM:'Lima',MEX:'Mexico City',
  SYD:'Sydney',MEL:'Melbourne',BNE:'Brisbane',PER:'Perth',AKL:'Auckland',
  DEL:'Delhi',BOM:'Mumbai',MAA:'Chennai',BLR:'Bangalore',HYD:'Hyderabad',
  CCU:'Kolkata',CMB:'Colombo',DAC:'Dhaka',KTM:'Kathmandu',MLE:'Malé',
  CPH:'Copenhagen',ARN:'Stockholm',HEL:'Helsinki',OSL:'Oslo',DUB:'Dublin',
  EDI:'Edinburgh',MAN:'Manchester',BRU:'Brussels',LIS:'Lisbon',OPO:'Porto',
  WAW:'Warsaw',PRG:'Prague',BUD:'Budapest',BEG:'Belgrade',SOF:'Sofia',
  OTP:'Bucharest',KBP:'Kyiv',SVO:'Moscow',DME:'Moscow',LED:'St Petersburg',
  TLV:'Tel Aviv',AMM:'Amman',BEY:'Beirut',MCT:'Muscat',KHI:'Karachi',
  LHE:'Lahore',ISB:'Islamabad',KBL:'Kabul',ULN:'Ulaanbaatar',
  CTS:'Sapporo',OKA:'Okinawa',FUK:'Fukuoka',KIX:'Osaka',NGO:'Nagoya',
  TPE:'Taipei',KHH:'Kaohsiung',TSA:'Taipei',MFM:'Macau',CAN:'Guangzhou',
  SZX:'Shenzhen',CTU:'Chengdu',XIY:'Xi\'an',WUH:'Wuhan',CKG:'Chongqing',
};

// City name from IATA code
const airportCity = code => (code && AIRPORTS[code.toUpperCase()]) || code || '—';

// ─── AIRLINE LOOKUP ──────────────────────────────────────────────
const AIRLINES = {
  SQ:'Singapore Airlines', CX:'Cathay Pacific', MH:'Malaysia Airlines',
  TG:'Thai Airways', GA:'Garuda Indonesia', MI:'Scoot', TR:'Scoot',
  QF:'Qantas', VA:'Virgin Australia', EK:'Emirates', EY:'Etihad',
  QR:'Qatar Airways', SV:'Saudi Arabian', WY:'Oman Air',
  BA:'British Airways', LH:'Lufthansa', AF:'Air France',
  KL:'KLM', SK:'SAS', AY:'Finnair', IB:'Iberia', AZ:'ITA Airways',
  JL:'Japan Airlines', NH:'ANA', OZ:'Asiana Airlines', KE:'Korean Air',
  CI:'China Airlines', BR:'EVA Air', CA:'Air China', JX:'Starlux',
  CZ:'China Southern', MU:'China Eastern', HX:'Hong Kong Airlines',
  AI:'Air India', UK:'Vistara', '6E':'IndiGo', SG:'SpiceJet',
  AA:'American Airlines', DL:'Delta Air Lines', UA:'United Airlines',
  WN:'Southwest Airlines', AC:'Air Canada', WS:'WestJet',
  LA:'LATAM Airlines', G3:'Gol', CM:'Copa Airlines',
  TK:'Turkish Airlines', PC:'Pegasus', VY:'Vueling',
  FR:'Ryanair', U2:'easyJet', W6:'Wizz Air', BE:'Flybe',
};

// Extract airline name from flight number prefix (e.g. "SQ633" → "Singapore Airlines")
const airlineFromCode = code => {
  if (!code) return null;
  const m = code.replace(/\s+/g,'').toUpperCase().match(/^([A-Z]{2,3})/);
  return m ? (AIRLINES[m[1]] || null) : null;
};

// ─── STATIC FLIGHT ROUTES ────────────────────────────────────────
// Common flight number → { dep, arr } routes.
// Covers top Asian, Middle East, European and Oceanian routes.
// Zero API calls — works offline, instant, never fails.
const FLIGHT_ROUTES = {
  // Singapore Airlines (SQ)
  SQ633:'HND-SIN', SQ634:'SIN-HND', SQ011:'SIN-LHR', SQ012:'LHR-SIN',
  SQ021:'SIN-JFK', SQ022:'JFK-SIN', SQ231:'SIN-SYD', SQ232:'SYD-SIN',
  SQ211:'SIN-MEL', SQ212:'MEL-SIN', SQ221:'SIN-BNE', SQ222:'BNE-SIN',
  SQ317:'SIN-DXB', SQ318:'DXB-SIN', SQ321:'SIN-LHR', SQ322:'LHR-SIN',
  SQ334:'SIN-AMS', SQ335:'AMS-SIN', SQ351:'SIN-FRA', SQ352:'FRA-SIN',
  SQ401:'SIN-HKG', SQ402:'HKG-SIN', SQ411:'SIN-PVG', SQ412:'PVG-SIN',
  SQ421:'SIN-PEK', SQ422:'PEK-SIN', SQ501:'SIN-BKK', SQ502:'BKK-SIN',
  SQ507:'SIN-BKK', SQ508:'BKK-SIN', SQ511:'SIN-KUL', SQ512:'KUL-SIN',
  SQ521:'SIN-CGK', SQ522:'CGK-SIN', SQ551:'SIN-MNL', SQ552:'MNL-SIN',
  SQ571:'SIN-ICN', SQ572:'ICN-SIN', SQ601:'SIN-DEL', SQ602:'DEL-SIN',
  SQ621:'SIN-BOM', SQ622:'BOM-SIN', SQ701:'SIN-LAX', SQ702:'LAX-SIN',
  SQ033:'SIN-SFO', SQ034:'SFO-SIN', SQ037:'SIN-IAH', SQ038:'IAH-SIN',
  // ANA (NH)
  NH843:'HND-SIN', NH844:'SIN-HND', NH803:'NRT-LHR', NH804:'LHR-NRT',
  NH001:'NRT-JFK', NH002:'JFK-NRT', NH005:'NRT-LAX', NH006:'LAX-NRT',
  // Japan Airlines (JL)
  JL041:'NRT-LHR', JL042:'LHR-NRT', JL061:'NRT-JFK', JL062:'JFK-NRT',
  JL009:'NRT-LAX', JL010:'LAX-NRT', JL705:'NRT-SIN', JL706:'SIN-NRT',
  // Cathay Pacific (CX)
  CX101:'HKG-LHR', CX102:'LHR-HKG', CX841:'HKG-SIN', CX842:'SIN-HKG',
  CX531:'HKG-NRT', CX532:'NRT-HKG', CX471:'HKG-LAX', CX472:'LAX-HKG',
  // Emirates (EK)
  EK351:'DXB-SIN', EK352:'SIN-DXB', EK001:'DXB-LHR', EK002:'LHR-DXB',
  EK003:'DXB-LHR', EK004:'LHR-DXB', EK211:'DXB-JFK', EK212:'JFK-DXB',
  EK431:'DXB-BKK', EK432:'BKK-DXB', EK404:'DXB-KUL', EK403:'KUL-DXB',
  // Qatar Airways (QR)
  QR007:'DOH-LHR', QR008:'LHR-DOH', QR549:'DOH-SIN', QR550:'SIN-DOH',
  // British Airways (BA)
  BA011:'LHR-JFK', BA012:'JFK-LHR', BA013:'LHR-JFK', BA014:'JFK-LHR',
  BA017:'LHR-LAX', BA018:'LAX-LHR', BA031:'LHR-SIN', BA032:'SIN-LHR',
  // Qantas (QF)
  QF001:'SYD-LHR', QF002:'LHR-SYD', QF007:'SYD-LAX', QF008:'LAX-SYD',
  // Malaysia Airlines (MH)
  MH601:'KUL-SIN', MH602:'SIN-KUL', MH003:'KUL-LHR', MH004:'LHR-KUL',
  // Thai Airways (TG)
  TG411:'BKK-SIN', TG412:'SIN-BKK', TG917:'BKK-NRT', TG918:'NRT-BKK',
  // Korean Air (KE)
  KE641:'ICN-SIN', KE642:'SIN-ICN', KE001:'ICN-JFK', KE002:'JFK-ICN',
  // EVA Air (BR)
  BR225:'TPE-SIN', BR226:'SIN-TPE', BR011:'TPE-LAX', BR012:'LAX-TPE',
};

// Look up FROM/TO for a flight number — returns {dep, arr} or null
const routeLookup = (flightNum) => {
  const key = flightNum.replace(/\s+/g,'').toUpperCase();
  const route = FLIGHT_ROUTES[key];
  if (!route) return null;
  const [dep, arr] = route.split('-');
  return { dep, arr };
};
// Calls the flight-status Edge Function which:
//   1. Checks a 10-minute Supabase cache first
//   2. Calls AeroDataBox if cache is stale
//   3. Returns normalised status object
// Falls back to time-based local status on any error.
// Input: flightNumber (e.g. 'SQ321') + date (e.g. '2026-04-25')

// Semantic colour tokens — defined early so flightStatusLocal can use SUCCESS
const SUCCESS = '#2A7A42';   // landed / confirmed green
const WARN    = '#C46A14';   // amber warning / past-due

// Local time-based fallback — used when API unavailable or flight has no number
const flightStatusLocal = (flight) => {
  if (!flight.date || !flight.time) return null;
  const dep  = new Date(`${flight.date}T${flight.time}`);
  const now  = new Date();
  const mins = (now - dep) / 60000;
  let arrMins = 480;
  if (flight.endTime) {
    const [ah, am] = flight.endTime.split(':').map(Number);
    const [dh, dm] = flight.time.split(':').map(Number);
    arrMins = (ah * 60 + am) - (dh * 60 + dm);
    if (arrMins < 0) arrMins += 1440;
  }
  if (mins < -60)       return { label:'Scheduled',  color:'#5BB8E8', source:'local' };
  if (mins < -30)       return { label:'Check-in',   color:'#4D8EC4', source:'local' };
  if (mins < -10)       return { label:'Boarding',   color:'#C48060', source:'local' };
  if (mins < 0)         return { label:'Final Call', color:'#D4804C', source:'local' };
  if (mins < arrMins)   return { label:'In Flight',  color:'#5B90C8', source:'local' };
  return                       { label:'Landed',     color:SUCCESS, source:'local' };
};

// React hook — fetches live status, falls back to local
function useLiveFlightStatus(flight) {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  const [status,      setStatus]      = useState(() => flightStatusLocal(flight));
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => {
    // Only fetch if we have a flight number and supabase is configured
    if (!flight?.flightNum || !flight?.date || !supabaseConfigured) return;

    let cancelled = false;
    async function fetchStatus() {
      setLoading(true);
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !anonKey) throw new Error('not configured');
        const res = await fetch(`${supabaseUrl}/functions/v1/flight-status`, {
          method: 'POST',
          headers: { 'Content-Type':'application/json',
                     'Authorization':`Bearer ${anonKey}` },
          body: JSON.stringify({ flightNumber: flight.flightNum, date: flight.date }),
        });
        if (cancelled) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data?.error) throw new Error(data.error);
        setStatus(data);
        setLastUpdated(new Date());
      } catch {
        setStatus(flightStatusLocal(flight));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchStatus();
    // Refresh every 5 minutes while card is visible
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight?.flightNum, flight?.date]);

  return { status, lastUpdated, loading };
}


// Warm cream base · Terracotta rose accent · Blue/orange entry system
// Deuteranopia/protanopia safe: green replaced with cornflower blue;
// ─── LIGHT PALETTE (default) ─────────────────────────────────────
const C_LIGHT = {
  bg:      '#F8F5F1',
  card:    '#FFFEFB',
  elevated:'#F0EAE2',
  border:  '#D8CEBC',
  muted:   '#9A9188',
  text:    '#1A1714',
  dim:     '#5C5349',
  rose:    '#B8715C',
  roseL:   '#E0A898',
  M:       '#4D8EC4',
  F:       '#5BB8E8',
  T:       '#4E7EC8',
  R:       '#A07840',
  E:       '#8A72B8',
};

// ─── DARK PALETTE (9pm – 7am) ────────────────────────────────────
const C_DARK = {
  bg:      '#16130F',   // deep warm black
  card:    '#1E1A15',   // lifted dark card
  elevated:'#272118',   // inputs, chips
  border:  '#3A3028',   // subtle warm border
  muted:   '#988E80',   // muted text — contrast ≥4.5:1 on all dark surfaces (WCAG AA)
  text:    '#F0E8DC',   // warm cream — contrast 14:1 on dark
  dim:     '#B0A090',   // secondary text — contrast 6:1 on dark
  rose:    '#D4957F',   // lightened rose — same hue, better contrast on dark
  roseL:   '#E8B8A8',
  M:       '#6AAAD8',   // lighter steel blue for dark bg
  F:       '#7ACAED',   // lighter sky blue
  T:       '#6A9ADA',   // lighter cornflower
  R:       '#C49458',   // lighter toffee
  E:       '#A890CC',   // lighter lavender
};

// Keep C as the light default for module-level derived constants
const C = C_LIGHT;

// ─── THEME CONTEXT ────────────────────────────────────────────────
const ThemeContext = createContext(C_LIGHT);
// WorkspaceContext: provides member name resolution to any component
const WorkspaceContext = createContext([]);

// ─── HELPERS: check dark hours (9pm=21 to 7am=7) ─────────────────
function isDarkHour(now = new Date()) {
  const h = now.getHours();
  return h >= 21 || h < 7;
}

const TC  = { meeting:C.M, flight:C.F, task:C.T, reminder:C.R, event:C.E, birthday:'#C4729A' };
const TI  = { meeting:'◯', flight:'◇', task:'□', reminder:'◷', event:'◈', birthday:'🎂' };
const TL  = { meeting:'Appointment', flight:'Flight', task:'Task', reminder:'Reminder', event:'Event', birthday:'Birthday / Anniversary' };

// DTC — dark type colors for TEXT/ICONS on same-hue tinted backgrounds.
// Each gives ≥ 7:1 contrast on TC[type]+'28' tint, ≥ 9:1 on white card.

// ─── AIRPORT DATABASE ─────────────────────────────────────────────────────────
// Format: [IATA, city, name, country_code, country_name]
// ~200 airports covering major destinations from Singapore
const AIRPORT_DB = [
  ['SIN','Singapore','Changi Airport','SG','Singapore'],
  ['SZB','Singapore','Seletar Airport','SG','Singapore'],
  ['HND','Tokyo','Haneda Airport','JP','Japan'],
  ['NRT','Tokyo','Narita Airport','JP','Japan'],
  ['KIX','Osaka','Kansai Airport','JP','Japan'],
  ['ITM','Osaka','Itami Airport','JP','Japan'],
  ['NGO','Nagoya','Chubu Airport','JP','Japan'],
  ['CTS','Sapporo','Chitose Airport','JP','Japan'],
  ['FUK','Fukuoka','Fukuoka Airport','JP','Japan'],
  ['OKA','Okinawa','Naha Airport','JP','Japan'],
  ['HIJ','Hiroshima','Hiroshima Airport','JP','Japan'],
  ['SDJ','Sendai','Sendai Airport','JP','Japan'],
  ['ICN','Seoul','Incheon Airport','KR','South Korea'],
  ['GMP','Seoul','Gimpo Airport','KR','South Korea'],
  ['PUS','Busan','Gimhae Airport','KR','South Korea'],
  ['CJU','Jeju','Jeju Airport','KR','South Korea'],
  ['HKG','Hong Kong','Hong Kong Airport','HK','Hong Kong'],
  ['TPE','Taipei','Taoyuan Airport','TW','Taiwan'],
  ['TSA','Taipei','Songshan Airport','TW','Taiwan'],
  ['KHH','Kaohsiung','Kaohsiung Airport','TW','Taiwan'],
  ['PEK','Beijing','Capital Airport','CN','China'],
  ['PKX','Beijing','Daxing Airport','CN','China'],
  ['PVG','Shanghai','Pudong Airport','CN','China'],
  ['SHA','Shanghai','Hongqiao Airport','CN','China'],
  ['CAN','Guangzhou','Baiyun Airport','CN','China'],
  ['SZX','Shenzhen','Bao an Airport','CN','China'],
  ['CTU','Chengdu','Shuangliu Airport','CN','China'],
  ['CKG','Chongqing','Jiangbei Airport','CN','China'],
  ['XIY','Xi an','Xianyang Airport','CN','China'],
  ['KMG','Kunming','Changshui Airport','CN','China'],
  ['CGQ','Changchun','Longjia Airport','CN','China'],
  ['BKK','Bangkok','Suvarnabhumi Airport','TH','Thailand'],
  ['DMK','Bangkok','Don Mueang Airport','TH','Thailand'],
  ['HKT','Phuket','Phuket Airport','TH','Thailand'],
  ['CNX','Chiang Mai','Chiang Mai Airport','TH','Thailand'],
  ['KBV','Krabi','Krabi Airport','TH','Thailand'],
  ['USM','Koh Samui','Samui Airport','TH','Thailand'],
  ['KUL','Kuala Lumpur','KLIA','MY','Malaysia'],
  ['SZB','Kuala Lumpur','Subang Airport','MY','Malaysia'],
  ['PEN','Penang','Penang Airport','MY','Malaysia'],
  ['IPH','Ipoh','Sultan Azlan Shah Airport','MY','Malaysia'],
  ['BKI','Kota Kinabalu','KK Airport','MY','Malaysia'],
  ['KCH','Kuching','Kuching Airport','MY','Malaysia'],
  ['CGK','Jakarta','Soekarno-Hatta Airport','ID','Indonesia'],
  ['DPS','Bali','Ngurah Rai Airport','ID','Indonesia'],
  ['SUB','Surabaya','Juanda Airport','ID','Indonesia'],
  ['MDC','Manado','Sam Ratulangi Airport','ID','Indonesia'],
  ['UPG','Makassar','Sultan Hasanuddin Airport','ID','Indonesia'],
  ['MNL','Manila','Ninoy Aquino Airport','PH','Philippines'],
  ['CEB','Cebu','Mactan-Cebu Airport','PH','Philippines'],
  ['DVO','Davao','Francisco Bangoy Airport','PH','Philippines'],
  ['SGN','Ho Chi Minh City','Tan Son Nhat Airport','VN','Vietnam'],
  ['HAN','Hanoi','Noi Bai Airport','VN','Vietnam'],
  ['DAD','Da Nang','Da Nang Airport','VN','Vietnam'],
  ['PQC','Phu Quoc','Phu Quoc Airport','VN','Vietnam'],
  ['REP','Siem Reap','Angkor Airport','KH','Cambodia'],
  ['PNH','Phnom Penh','Pochentong Airport','KH','Cambodia'],
  ['RGN','Yangon','Mingaladon Airport','MM','Myanmar'],
  ['VTE','Vientiane','Wattay Airport','LA','Laos'],
  ['LPQ','Luang Prabang','Luang Prabang Airport','LA','Laos'],
  ['BWN','Bandar Seri Begawan','Brunei Airport','BN','Brunei'],
  ['CMB','Colombo','Bandaranaike Airport','LK','Sri Lanka'],
  ['MLE','Male','Velana Airport','MV','Maldives'],
  ['BOM','Mumbai','Chhatrapati Shivaji Airport','IN','India'],
  ['DEL','Delhi','Indira Gandhi Airport','IN','India'],
  ['BLR','Bangalore','Kempegowda Airport','IN','India'],
  ['MAA','Chennai','Anna Airport','IN','India'],
  ['HYD','Hyderabad','Rajiv Gandhi Airport','IN','India'],
  ['CCU','Kolkata','Netaji Subhash Airport','IN','India'],
  ['COK','Kochi','Cochin Airport','IN','India'],
  ['LHR','London','Heathrow Airport','GB','United Kingdom'],
  ['LGW','London','Gatwick Airport','GB','United Kingdom'],
  ['STN','London','Stansted Airport','GB','United Kingdom'],
  ['LTN','London','Luton Airport','GB','United Kingdom'],
  ['MAN','Manchester','Manchester Airport','GB','United Kingdom'],
  ['EDI','Edinburgh','Edinburgh Airport','GB','United Kingdom'],
  ['GLA','Glasgow','Glasgow Airport','GB','United Kingdom'],
  ['BHX','Birmingham','Birmingham Airport','GB','United Kingdom'],
  ['CDG','Paris','Charles de Gaulle Airport','FR','France'],
  ['ORY','Paris','Orly Airport','FR','France'],
  ['NCE','Nice','Nice Airport','FR','France'],
  ['LYS','Lyon','Saint-Exupery Airport','FR','France'],
  ['MRS','Marseille','Marseille Airport','FR','France'],
  ['FRA','Frankfurt','Frankfurt Airport','DE','Germany'],
  ['MUC','Munich','Munich Airport','DE','Germany'],
  ['DUS','Dusseldorf','Dusseldorf Airport','DE','Germany'],
  ['HAM','Hamburg','Hamburg Airport','DE','Germany'],
  ['TXL','Berlin','Tegel Airport','DE','Germany'],
  ['BER','Berlin','Brandenburg Airport','DE','Germany'],
  ['AMS','Amsterdam','Schiphol Airport','NL','Netherlands'],
  ['ZRH','Zurich','Zurich Airport','CH','Switzerland'],
  ['GVA','Geneva','Geneva Airport','CH','Switzerland'],
  ['VIE','Vienna','Vienna Airport','AT','Austria'],
  ['BRU','Brussels','Brussels Airport','BE','Belgium'],
  ['CPH','Copenhagen','Copenhagen Airport','DK','Denmark'],
  ['ARN','Stockholm','Arlanda Airport','SE','Sweden'],
  ['HEL','Helsinki','Helsinki Airport','FI','Finland'],
  ['OSL','Oslo','Gardermoen Airport','NO','Norway'],
  ['LIS','Lisbon','Humberto Delgado Airport','PT','Portugal'],
  ['OPO','Porto','Francisco de Sa Carneiro Airport','PT','Portugal'],
  ['MAD','Madrid','Adolfo Suarez Airport','ES','Spain'],
  ['BCN','Barcelona','El Prat Airport','ES','Spain'],
  ['AGP','Malaga','Malaga Airport','ES','Spain'],
  ['PMI','Palma de Mallorca','Mallorca Airport','ES','Spain'],
  ['FCO','Rome','Fiumicino Airport','IT','Italy'],
  ['MXP','Milan','Malpensa Airport','IT','Italy'],
  ['LIN','Milan','Linate Airport','IT','Italy'],
  ['VCE','Venice','Marco Polo Airport','IT','Italy'],
  ['NAP','Naples','Naples Airport','IT','Italy'],
  ['ATH','Athens','Athens Airport','GR','Greece'],
  ['SKG','Thessaloniki','Makedonia Airport','GR','Greece'],
  ['JFK','New York','JFK Airport','US','United States'],
  ['EWR','New York','Newark Airport','US','United States'],
  ['LGA','New York','LaGuardia Airport','US','United States'],
  ['PHL','Philadelphia','Philadelphia Intl Airport','US','United States'],
  ['LAX','Los Angeles','LAX Airport','US','United States'],
  ['SFO','San Francisco','SFO Airport','US','United States'],
  ['ORD','Chicago','O Hare Airport','US','United States'],
  ['MDW','Chicago','Midway Airport','US','United States'],
  ['MIA','Miami','Miami Airport','US','United States'],
  ['SEA','Seattle','Sea-Tac Airport','US','United States'],
  ['BOS','Boston','Logan Airport','US','United States'],
  ['DFW','Dallas','Dallas Fort Worth Airport','US','United States'],
  ['IAH','Houston','George Bush Airport','US','United States'],
  ['DEN','Denver','Denver Airport','US','United States'],
  ['ATL','Atlanta','Hartsfield-Jackson Airport','US','United States'],
  ['LAS','Las Vegas','McCarran Airport','US','United States'],
  ['PHX','Phoenix','Sky Harbour Airport','US','United States'],
  ['MSP','Minneapolis','Minneapolis Airport','US','United States'],
  ['DTW','Detroit','Metro Airport','US','United States'],
  ['CLT','Charlotte','Douglas Airport','US','United States'],
  ['IAD','Washington','Dulles Airport','US','United States'],
  ['DCA','Washington','Reagan Airport','US','United States'],
  ['YVR','Vancouver','Vancouver Airport','CA','Canada'],
  ['YYZ','Toronto','Pearson Airport','CA','Canada'],
  ['YUL','Montreal','Trudeau Airport','CA','Canada'],
  ['YYC','Calgary','Calgary Airport','CA','Canada'],
  ['SYD','Sydney','Sydney Airport','AU','Australia'],
  ['MEL','Melbourne','Melbourne Airport','AU','Australia'],
  ['BNE','Brisbane','Brisbane Airport','AU','Australia'],
  ['PER','Perth','Perth Airport','AU','Australia'],
  ['ADL','Adelaide','Adelaide Airport','AU','Australia'],
  ['AKL','Auckland','Auckland Airport','NZ','New Zealand'],
  ['CHC','Christchurch','Christchurch Airport','NZ','New Zealand'],
  ['DXB','Dubai','Dubai International Airport','AE','UAE'],
  ['AUH','Abu Dhabi','Abu Dhabi Airport','AE','UAE'],
  ['DOH','Doha','Hamad Airport','QA','Qatar'],
  ['BAH','Manama','Bahrain Airport','BH','Bahrain'],
  ['KWI','Kuwait City','Kuwait Airport','KW','Kuwait'],
  ['AMM','Amman','Queen Alia Airport','JO','Jordan'],
  ['CAI','Cairo','Cairo Airport','EG','Egypt'],
  ['IST','Istanbul','Istanbul Airport','TR','Turkey'],
  ['SAW','Istanbul','Sabiha Gokcen Airport','TR','Turkey'],
  ['TLV','Tel Aviv','Ben Gurion Airport','IL','Israel'],
  ['NBO','Nairobi','Jomo Kenyatta Airport','KE','Kenya'],
  ['JNB','Johannesburg','OR Tambo Airport','ZA','South Africa'],
  ['CPT','Cape Town','Cape Town Airport','ZA','South Africa'],
  ['DUR','Durban','King Shaka Airport','ZA','South Africa'],
  ['LOS','Lagos','Murtala Muhammed Airport','NG','Nigeria'],
  ['ACC','Accra','Kotoka Airport','GH','Ghana'],
  ['ADD','Addis Ababa','Bole Airport','ET','Ethiopia'],
  ['CMN','Casablanca','Mohammed V Airport','MA','Morocco'],
  ['RBA','Rabat','Rabat-Sale Airport','MA','Morocco'],
  ['TUN','Tunis','Tunis-Carthage Airport','TN','Tunisia'],
  ['GRU','Sao Paulo','Guarulhos Airport','BR','Brazil'],
  ['GIG','Rio de Janeiro','Galeao Airport','BR','Brazil'],
  ['EZE','Buenos Aires','Ezeiza Airport','AR','Argentina'],
  ['BOG','Bogota','El Dorado Airport','CO','Colombia'],
  ['SCL','Santiago','Comodoro Arturo Merino Airport','CL','Chile'],
  ['LIM','Lima','Jorge Chavez Airport','PE','Peru'],
  ['MEX','Mexico City','Benito Juarez Airport','MX','Mexico'],
  ['CUN','Cancun','Cancun Airport','MX','Mexico'],
  ['SVO','Moscow','Sheremetyevo Airport','RU','Russia'],
  ['DME','Moscow','Domodedovo Airport','RU','Russia'],
  ['LED','St Petersburg','Pulkovo Airport','RU','Russia'],
];

// Search airports by IATA, city, or name — returns up to 8 matches
const searchAirports = (q) => {
  if (!q || q.length < 2) return [];
  const s = q.toUpperCase();
  const sl = s.toLowerCase();
  return AIRPORT_DB.filter(([iata, city, name]) =>
    iata.startsWith(s) ||
    city.toUpperCase().startsWith(s) ||
    name.toLowerCase().includes(sl) ||
    city.toLowerCase().includes(sl)
  ).slice(0, 8);
};

// Country code → flag emoji
const countryFlag = (code) => {
  if (!code || code.length !== 2) return '';
  return [...code.toUpperCase()].map(c =>
    String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)
  ).join('');
};

// DTC — type accent colours (light mode). Use getDTC(C) in components for theme safety.
const DTC = {
  meeting:  '#1C4878',
  flight:   '#0A4268',
  task:     '#1A3A78',
  reminder: '#4A2E08',
  event:    '#38186A',
  birthday: '#7A2A5A',
};
// Theme-aware DTC: dark mode uses lighter accents from C_DARK palette
const getDTC = (c) => c === C_DARK ? {
  meeting:  c.M,          // #6AAAD8 — passes AA
  flight:   c.F,          // #7ACAED — passes AA
  task:     c.T,          // #6A9ADA — passes AA
  reminder: c.R,          // #C49458 — passes AA
  event:    c.E,          // #A890CC — passes AA
  birthday: '#D87EB0',    // lighter rose — passes AA
} : DTC;

const PC = { low:DTC.task, medium:'#6B4E10', high:'#8A3A08', critical:'#6A2408' };
const AL = { created:'Created', completed:'Completed', reopened:'Reopened', deleted:'Deleted', updated:'Updated' };

const getTC = (c) => ({ meeting:c.M, flight:c.F, task:c.T, reminder:c.R, event:c.E, birthday:'#C4729A' });
const getAC = (c) => ({ created:c.rose, completed:DTC.task, reopened:DTC.meeting, deleted:'#8A3A08', updated:DTC.event });

// getSH — softer shadows for dark mode
const getSH = (dark) => dark ? {
  card:    '0 2px 16px rgba(0,0,0,0.35)',
  float:   '0 8px 32px rgba(0,0,0,0.50)',
  subtle:  '0 1px 6px  rgba(0,0,0,0.25)',
} : {
  card:    '0 2px 16px rgba(44,38,32,0.07)',
  float:   '0 8px 32px rgba(44,38,32,0.12)',
  subtle:  '0 1px 6px  rgba(44,38,32,0.05)',
};

// Border radius tokens — consistent across entire app
const BR = {
  card:  20,   // large content cards, hero cards
  panel: 16,   // modal sheets, settings sections
  input: 14,   // inputs, small cards, chips
  btn:   12,   // buttons, compact inputs, dropdowns
  pill:  10,   // badges, tags, status pills
  dot:   6,    // small indicators
};

// Type scale — follow this for all new text
// 28+ : display (greeting name, Kizuna header)
// 18-22: card/section titles
// 16  : body text, input text, primary labels
// 14  : secondary info, metadata, button labels
// 12  : uppercase section labels, timestamps, captions
const SCHEMA_VERSION = 1;
const APP_VERSION    = 'v2.3.0';
const APP_BUILD_DATE = 'May 2, 2026';

// Load own entries from Supabase — simple, reliable query
async function dbLoadEntries(userId) {
  const { data, error } = await supabase
    .from('entries')
    .select('data')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(r => r.data).filter(Boolean);
}

// Load audit log (last 200)
async function dbLoadAudit(userId) {
  const { data, error } = await supabase
    .from('audit_log').select('data').eq('user_id', userId)
    .order('created_at', { ascending: true }).limit(200);
  if (error) throw error;
  return data.map(r => r.data);
}

// Upsert a single entry
async function dbUpsertEntry(userId, entry, callerUserId = null) {
  // If the caller is different from the entry owner (admin editing member's entry),
  // use the admin_upsert_entry RPC which has SECURITY DEFINER to bypass RLS
  if (callerUserId && callerUserId !== userId) {
    const { error } = await supabase.rpc('admin_upsert_entry', {
      p_entry_id:   entry.id,
      p_owner_id:   userId,
      p_data:       entry,
      p_caller_id:  callerUserId,
    });
    if (error) console.warn('admin_upsert_entry error:', error.message);
    return;
  }
  const { error } = await supabase.from('entries')
    .upsert({ id: entry.id, user_id: userId, data: entry, updated_at: new Date().toISOString() });
}

// Delete a single entry
async function dbDeleteEntry(userId, entryId) {
  const { error } = await supabase.from('entries').delete()
    .eq('id', entryId).eq('user_id', userId);
  
}

// Append audit event
async function dbAppendAudit(userId, event) {
  const { error } = await supabase.from('audit_log')
    .upsert({ id: event.id, user_id: userId, data: event });
  
}

// Wipe all data (Reset App Data)
async function dbResetUser(userId) {
  await supabase.from('entries').delete().eq('user_id', userId);
  await supabase.from('audit_log').delete().eq('user_id', userId);
}

// Display name — stored in profiles table + cached in localStorage per user
async function dbSaveName(userId, name) {
  localStorage.setItem(`exec_user_v1_${userId}`, name);
  await supabase.from('profiles')
    .upsert({ id: userId, display_name: name, updated_at: new Date().toISOString() });
}
async function dbLoadName(userId) {
  // Always fetch from DB first for cross-device consistency.
  // Use maybeSingle() — returns null (not error) if profile row doesn't exist yet.
  try {
    const { data, error } = await supabase.from('profiles')
      .select('display_name').eq('id', userId).maybeSingle();
    if (!error && data?.display_name) {
      localStorage.setItem(`exec_user_v1_${userId}`, data.display_name);
      return data.display_name;
    }
  } catch { /* offline — fall through */ }
  return localStorage.getItem(`exec_user_v1_${userId}`) || '';
}

// Load workspace — two separate queries for reliability
// Nested joins can be blocked by RLS; direct queries are safer
async function dbLoadWorkspace(userId) {
  // Step 1: get this user's workspace memberships
  const { data: memberships, error: e1 } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', userId);
  if (e1 || !memberships || memberships.length === 0) return null;

  // Step 2: pick the workspace to use
  // Prefer a workspace the user was INVITED to (not the one they own solo).
  // This ensures invited members see the shared workspace, not their own.
  let workspaceId, resolvedRole, workspaceName, ownerId;

  // Check if user owns any workspace
  const { data: ownedWs } = await supabase
    .from('workspaces')
    .select('id, name, owner_id')
    .eq('owner_id', userId)
    .maybeSingle();

  // Find a membership in a workspace the user does NOT own
  const sharedMembership = memberships.find(m => m.workspace_id !== ownedWs?.id);

  if (sharedMembership) {
    // User is invited to someone else's workspace — use that
    workspaceId  = sharedMembership.workspace_id;
    resolvedRole = sharedMembership.role;
    const { data: ws } = await supabase
      .from('workspaces').select('id, name, owner_id')
      .eq('id', workspaceId).maybeSingle();
    workspaceName = ws?.name || 'Workspace';
    ownerId       = ws?.owner_id;
  } else if (ownedWs) {
    // User only has their own workspace — they are the admin
    workspaceId   = ownedWs.id;
    resolvedRole  = 'admin';
    workspaceName = ownedWs.name;
    ownerId       = ownedWs.owner_id;
  } else {
    // Fallback: use first membership directly
    const m      = memberships[0];
    workspaceId  = m.workspace_id;
    resolvedRole = m.role;
    const { data: ws } = await supabase
      .from('workspaces').select('id, name, owner_id')
      .eq('id', workspaceId).maybeSingle();
    workspaceName = ws?.name || 'Workspace';
    ownerId       = ws?.owner_id;
  }

  if (!workspaceId) return null;

  // Step 3: get all members of this workspace
  const { data: members } = await supabase
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', workspaceId);

  // Step 4: get display names separately — avoids FK join requirement
  const memberIds = (members || []).map(m => m.user_id);
  const { data: profiles } = memberIds.length > 0
    ? await supabase.from('profiles').select('id, display_name').in('id', memberIds)
    : { data: [] };

  const profileMap = {};
  (profiles || []).forEach(p => { profileMap[p.id] = p.display_name; });

  return {
    id:      workspaceId,
    name:    workspaceName || 'Workspace',
    ownerId,
    role:    resolvedRole,
    members: (members || []).map(m => ({
      id:   m.user_id,
      name: profileMap[m.user_id] || 'Unknown',
      role: m.role,
    })),
  };
}

// Invite a member by email — stored as pending invite, auto-accepted on signup
async function dbInviteMember(workspaceId, invitedByUserId, email) {
  const { error } = await supabase
    .from('workspace_invites')
    .upsert({
      workspace_id: workspaceId,
      email:        email.toLowerCase().trim(),
      invited_by:   invitedByUserId,
    });
  return !error;
}

// Remove a member from workspace
async function dbRemoveMember(workspaceId, memberId) {
  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', memberId);
  return !error;
}


// ─── SHARED UI ATOMS ─────────────────────────────────────────────
function Sec({ label, count }) {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, marginTop:30 }}>
      <span style={{ fontSize:14, fontWeight:700, color:C.rose, textTransform:'uppercase', letterSpacing:'0.14em', whiteSpace:'nowrap' }}>{label}</span>
      {count != null && (
        <span style={{ fontSize:14, color:C.dim, background:C.elevated, borderRadius:BR.pill,
          padding:'3px 10px', boxShadow:SH.subtle }}>{count}</span>
      )}
      <div style={{ flex:1, height:'1px', background:C.border }} />
    </div>
  );
}

function SS({ title, children }) {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  return (
    <div style={{ marginBottom:14 }}>
      <p style={{ fontSize:14, fontWeight:700, color:C.rose, textTransform:'uppercase',
        letterSpacing:'0.14em', margin:'28px 0 10px' }}>{title}</p>
      <div style={{ background:C.card, borderRadius:BR.card, overflow:'hidden',
        boxShadow:SH.card, border:`1px solid ${C.border}` }}>
        {children}
      </div>
    </div>
  );
}

function SR({ label, sub, right, noBorder }) {
  const C = useContext(ThemeContext);
  return (
    <div style={{ display:'flex', alignItems:'center', padding:'18px 20px',
      borderBottom:noBorder?'none':`1px solid ${C.border}`, gap:14 }}>
      <div style={{ flex:1 }}>
        <p style={{ margin:0, fontSize:16, color:C.text, fontWeight:500 }}>{label}</p>
        {sub && <p style={{ margin:0, fontSize:14, color:C.dim, marginTop:3 }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

// ─── ENTRY CARD ──────────────────────────────────────────────────
function ECard({ e, onToggle, onCancel, onEdit, onDelete, currentUserId, readOnly=false, isAdmin=false }) {
  const C = useContext(ThemeContext);
  const wsMembers = useContext(WorkspaceContext); // hoisted — used in rows + pill
  const SH = getSH(C === C_DARK);
  const TC = getTC(C);
  const isReadOnly = readOnly || e._virtual === true;
  const col  = TC[e.type];
  const dcol = getDTC(C)[e.type] || col;
  const [open,       setOpen]       = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const isOwn = !e.userId || e.userId === currentUserId;
  // Admin can edit/delete any entry — own or others'
  const canEdit = isOwn || isAdmin;

  // F12: flights are past when departure time has passed
  // Use arrival time if available for more accurate "landed" detection
  const isFlightLanded = e.type === 'flight' && (() => {
    if (!e.date) return false;
    // If we have endTime (arrival), use that; otherwise use dep + 8h estimate
    if (e.endTime) {
      const arrDt = new Date(`${e.date}T${e.endTime}`);
      return arrDt < new Date();
    }
    const depDt = e.time ? new Date(`${e.date}T${e.time}`) : new Date(`${e.date}T23:59`);
    // Add 8h estimated flight time — don't mark as landed until likely arrived
    return depDt.getTime() + (8 * 3600000) < Date.now();
  })();

  const isPastDue = (() => {
    if (e.done || e.cancelled || e.type === 'flight') return false;
    if (!e.date) return false;
    const dt = e.time ? new Date(`${e.date}T${e.time}`) : new Date(`${e.date}T23:59`);
    return dt < new Date();
  })();

  const isCancelled = !!e.cancelled;

  const openMenu    = ev => { ev.stopPropagation(); setOpen(true);  setConfirmDel(false); };
  const closeMenu   = ev => { ev.stopPropagation(); setOpen(false); setConfirmDel(false); };
  const handleEdit  = ev => { ev.stopPropagation(); setOpen(false); onEdit   && onEdit(e); };
  const handleDelReq= ev => { ev.stopPropagation(); setConfirmDel(true); };
  const handleDelOk = ev => { ev.stopPropagation(); setOpen(false); setConfirmDel(false); onDelete && onDelete(e.id); };

  const pill = (bg, fg, border) => ({
    background:bg, color:fg, border:`1px solid ${border}`,
    borderRadius:22, padding:'8px 18px', fontSize:14, fontWeight:700,
    cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0,
  });

  // Activity icon — matches keywords in title to relevant emoji
  const actIcon = (() => {
    const t = (e.title||'').toLowerCase();
    const map = [
      // Sports & fitness
      [['golf','putting','driving range'],'⛳'],
      [['swim','swimming','pool','lap'],'🏊'],
      [['tennis','squash','badminton','racket'],'🎾'],
      [['yoga','pilates','stretch'],'🧘'],
      [['run','running','jog','marathon','5k','10k'],'🏃'],
      [['gym','workout','weights','lift','crossfit','hiit'],'💪'],
      [['cycle','cycling','bike','bicycle'],'🚴'],
      [['hike','hiking','trail','trek'],'🥾'],
      [['surf','surfing','paddle','kayak'],'🏄'],
      [['ski','skiing','snowboard'],'⛷️'],
      [['football','soccer','futsal'],'⚽'],
      [['basketball','hoops'],'🏀'],
      [['cricket'],'🏏'],
      [['rugby'],'🏉'],
      [['volleyball'],'🏐'],
      [['baseball','softball'],'⚾'],
      [['boxing','martial arts','mma','karate','judo','taekwondo'],'🥊'],
      // Food & drink
      [['dinner','supper','evening meal'],'🍽️'],
      [['lunch','brunch'],'🥗'],
      [['breakfast','morning meal'],'🍳'],
      [['coffee','cafe','kopi'],'☕'],
      [['tea','high tea'],'🫖'],
      [['drinks','cocktail','wine','beer','bar','pub'],'🍷'],
      [['bbq','barbecue','grill'],'🍖'],
      // Travel & transport
      [['flight','fly','airport','depart','arrive'],'✈️'],
      [['hotel','resort','check in','checkin','check-in'],'🏨'],
      [['drive','road trip'],'🚗'],
      [['train','rail','mrt','subway','metro','lrt'],'🚆'],
      [['cruise','ship','boat','ferry'],'🚢'],
      [['taxi','grab','uber','lyft'],'🚕'],
      // Health & wellness
      [['doctor','physician','gp','checkup','check-up','clinic visit'],'🩺'],
      [['dentist','dental','teeth','orthodon'],'🦷'],
      [['hospital','surgery','operation','ward'],'🏥'],
      [['massage','spa','facial','manicure','pedicure','beauty'],'💆'],
      [['medicine','pharmacy','prescription','dispensary'],'💊'],
      [['physio','physiotherapy','rehab','therapy'],'🏋️'],
      [['eye','optom','vision test'],'🤓'],
      // Appearance
      [['lash','lashes','eyelash','lash lift','lash extension'],'👱‍♀️'],
      [['hair','haircut','salon','barber','blowout','colour','tint','perm'],'💈'],
      [['glasses','spectacles','optical','lens','contact','shades','sunglasses'],'🤓'],
      [['nails','manicure','pedicure'],'💅'],
      [['blood','bleed','haemoglobin','platelet','transfusion','donate blood','blood test','blood draw'],'⛑️'],
      // Work & business
      [['call','phone','ring','dial'],'📞'],
      [['meeting','appt','appointment','catchup','catch up','catch-up','sync','standup','1-on-1','check in'],'👥'],
      [['interview','pitch','present'],'🎯'],
      [['presentation','demo','showcase'],'📊'],
      [['deadline','review'],'📋'],
      [['workshop','training','seminar','webinar','bootcamp'],'🎓'],
      [['conference','summit','forum','expo'],'🏛️'],
      [['negotiate','contract','sign','legal'],'🤝'],
      // Documents & admin
      [['claim','renew','renewal','extend','extension','reimburs'],'📃'],
      [['apply','application','register','registration','enrol','enroll'],'📨'],
      [['submit','send','dispatch','post','forward','email'],'📨'],
      [['visa','passport','immigration','customs','permit'],'🛂'],
      [['tax','iras','cpf','gst','filing'],'🧾'],
      [['insurance','policy','coverage','premium'],'📄'],
      [['pay','payment','bill','invoice','transfer','fee','wallet','bank','money','cash','atm','withdraw','deposit','fund'],'💰'],
      // Creative & building
      [['build','construct','install','set up','setup'],'👷'],
      [['create','design','make','craft','build','develop'],'👷‍♀️'],
      [['photo','photography','shoot','portrait'],'📸'],
      [['art','paint','draw','sketch','illustration'],'🎨'],
      [['music','practice','rehearsal','recording','studio'],'🎵'],
      // Collections & receiving
      [['collect','collection','pick up','pickup','fetch','receive','retrieve'],'🙌'],
      [['drop','deliver','send over','hand over'],'📦'],
      // Personal & family
      [['birthday','bday'],'🎂'],
      [['party','celebrate','celebration','anniversary'],'🎉'],
      [['wedding','anniversary','engagement'],'💍'],
      [['school','class','lesson','tuition','exam','test','quiz','study'],'📚'],
      [['market','wet market','pasar','bazaar','hawker','fishmonger'],'🐟'],
      [['shopping','buy','purchase','mall'],'🛍️'],
      [['movie','cinema','film','show','theatre','theater','concert','gig','performance'],'🎭'],
      [['museum','gallery','exhibition','heritage'],'🖼️'],
      [['prayer','church','mosque','temple','worship','mass','service'],'🙏'],
      [['volunteer','charity','community','donation','fundrais'],'🤝'],
      [['cook','cooking','bake','baking','recipe'],'🍳'],
      [['clean','laundry','wash','tidy','vacuum','housework'],'🧹'],
      [['move','moving','relocat','pack'],'📦'],
      [['repair','fix','maintenance','service','plumb','electrician'],'🔧'],
      [['plant','garden','water','prune','landscape'],'🌱'],
      [['pet','vet','veterinary','groom','dog','cat'],'🐾'],
    ];
    for (const [keywords, icon] of map) {
      if (keywords.some(k => t.includes(k))) return icon;
    }
    return null;
  })();

  // AI emoji fallback — called only when no static match found
  // Uses cached result from localStorage to avoid repeated API calls
  const [aiIcon, setAiIcon] = useState(null);
  useEffect(() => {
    if (actIcon) return; // static match found — no need for AI
    if (!e.title?.trim()) return;
    const cacheKey = `kizuna_emoji_${e.title.toLowerCase().trim().slice(0,80)}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) { setAiIcon(cached); return; }
    // Call Claude API for best emoji
    const ctrl = new AbortController();
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 20,
        messages: [{
          role: 'user',
          content: `Reply with exactly ONE emoji that best represents this calendar entry title. Reply with only the emoji, nothing else. If unsure, reply with 📌\n\nTitle: "${e.title}"`,
        }],
      }),
    })
      .then(r => r.json())
      .then(d => {
        const emoji = d?.content?.[0]?.text?.trim() || '🔸';
        // Basic validation — should be 1-2 chars (emoji)
        const clean = emoji.length <= 4 ? emoji : '🔸';
        localStorage.setItem(cacheKey, clean);
        setAiIcon(clean);
      })
      .catch(() => { setAiIcon('🔸'); });
    return () => ctrl.abort();
  }, [e.title, actIcon]);

  return (
    <div style={{ display:'flex', gap:16, padding:'18px 0',
      borderBottom:`1px solid ${C.border}`,
      opacity: isFlightLanded ? 0.7 : 1 }}>

      {/* Colour stripe */}
      <div style={{ width:5, minHeight:32, borderRadius:3,
        background: isFlightLanded ? C.T : col,
        flexShrink:0, marginTop:2 }} />

      <div style={{ flex:1, minWidth:0 }}>
        {/* Title row — tappable to toggle detail view */}
        <div onClick={() => { if (!open) setShowDetail(p=>!p); }}
          style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:6,
            cursor:'pointer' }}>
          {(e.type === 'task' || e.type === 'reminder' || isPastDue) && (
            <button onClick={ev => { ev.stopPropagation(); isOwn && onToggle && onToggle(e.id); }}
              style={{ width:26, height:26, borderRadius:7,
                border:`2px solid ${e.done ? C.T : isPastDue ? WARN : C.border}`,
                background: e.done ? C.T+'22' : isPastDue ? '#C46A1408' : 'transparent',
                cursor: isOwn ? 'pointer' : 'default', flexShrink:0, marginTop:1,
                display:'flex', alignItems:'center', justifyContent:'center',
                color: e.done ? C.T : WARN, fontSize:15, padding:0,
                transition:'background 0.15s, border-color 0.15s',
                opacity: isOwn ? 1 : 0.5 }}>
              {e.done ? '✅' : isPastDue ? '☑️' : ''}
            </button>
          )}
          {/* Activity icon — static keyword match, then AI fallback */}
          {(actIcon || aiIcon) && !isFlightLanded && (
            <span style={{ fontSize:18, flexShrink:0, marginTop:1, lineHeight:1 }}>
              {actIcon || aiIcon}
            </span>
          )}
          {/* Secondary person icon — shown when name appears in title */}
          {(() => {
            const t = (e.title || '').toLowerCase();
            if (t.includes('anna')) return <span style={{ fontSize:15, flexShrink:0, lineHeight:1 }}>💕</span>;
            if (t.includes('sophia')) return <span style={{ fontSize:15, flexShrink:0, lineHeight:1 }}>❤️</span>;
            return null;
          })()}
          <span style={{ fontSize:16, fontWeight:600,
            color: isCancelled ? WARN : (e.done || isFlightLanded) ? C.muted : isPastDue ? C.dim : C.text,
            textDecoration: (e.done || isCancelled || isPastDue || isFlightLanded) ? 'line-through' : 'none',
            lineHeight:'1.4', flex:1, minWidth:0,
            opacity: isCancelled ? 0.7 : (isPastDue && !e.done) || isFlightLanded ? 0.6 : 1 }}>
            {isCancelled && <span style={{ marginRight:5 }}>❌</span>}
            {e.title}
          </span>
          {/* Cancelled badge */}
          {isCancelled && (
            <span style={{ fontSize:12, fontWeight:700, color:'#fff',
              background:WARN, borderRadius:BR.pill, padding:'4px 12px',
              flexShrink:0, boxShadow:`0 2px 8px ${WARN}40` }}>
              Cancelled ✕
            </span>
          )}
          {/* Landed badge */}
          {isFlightLanded && (
            <span style={{ fontSize:12, fontWeight:700, color:'#fff',
              background:SUCCESS, borderRadius:BR.pill, padding:'4px 12px',
              flexShrink:0, boxShadow:`0 2px 8px ${SUCCESS}40` }}>
              Landed ✓
            </span>
          )}
          {!isFlightLanded && e.type === 'flight' && (
            <span style={{ fontSize:14, fontWeight:700, color:dcol,
              letterSpacing:'0.04em', flexShrink:0,
              background:col+'15', borderRadius:BR.pill, padding:'3px 10px' }}>
              {e.depCity||'?'}→{e.arrCity||'?'}
            </span>
          )}
        </div>

        {/* Meta / Actions / Confirm */}
        {!open ? (
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
            {e.date && (() => {
              const dt = new Date(e.date+'T00:00:00');
              const today = fd(new Date());
              const tomorrow = fd(new Date(Date.now()+86400000));
              const label = e.date === today    ? 'Today'
                          : e.date === tomorrow ? 'Tomorrow'
                          : `${DAY[dt.getDay()]} ${dt.getDate()} ${MON[dt.getMonth()]} ${dt.getFullYear()}`;
              return (
                <span style={{ fontSize:13, fontWeight:700, color:C.rose,
                  background:C.rose+'12', borderRadius:BR.pill,
                  padding:'2px 9px', flexShrink:0 }}>
                  {label}
                </span>
              );
            })()}
            {e.time      && <span style={{ fontSize:14, color:C.dim }}>{pt(e.time)}{e.endTime?` – ${pt(e.endTime)}`:''}</span>}
            {e.location  && <span style={{ fontSize:14, color:C.dim }}>📍 {e.location}</span>}
            {e.flightNum && <span style={{ fontSize:14, color:C.dim }}>{e.airline} · {e.flightNum}</span>}
            {e.type === 'flight' && (() => {
              const tvs = Array.isArray(e.travellers)&&e.travellers.length>0 ? e.travellers : (e.traveller ? [e.traveller] : []);
              const nmap = e.travellerNamesMap || {};
              const entryOwner = e.userId || e.user_id;

              // Traveller names — legacy entries (no traveller field): show entry owner
              let travellerNames;
              if (tvs.length > 0) {
                travellerNames = tvs.map(t => {
                  if (t === 'other') return e.travellerName || 'Others';
                  if (nmap[t]) return nmap[t];
                  if (t === entryOwner) return e.userName || 'Me';
                  const wm = wsMembers.find(m => m.id === t);
                  return wm?.name || '';
                }).filter(Boolean).join(', ');
              } else {
                // Legacy: no traveller set — implicit owner is the traveller
                travellerNames = e.userName || null;
              }

              return travellerNames ? (
                <span style={{ fontSize:13, color:C.F, background:C.F+'18',
                  borderRadius:BR.pill, padding:'2px 9px', flexShrink:0 }}>
                  ✈ {travellerNames}
                </span>
              ) : null;
            })()}
            {e.tags      && <span style={{ fontSize:14, color:C.dim }}>🏷 {e.tags}</span>}
            {e.message   && <span style={{ fontSize:14, color:C.dim, fontStyle:'italic' }}>{e.message}</span>}
            {e.repeat && e.repeat !== 'none' && (
              <span style={{ fontSize:12, color:C.rose, background:C.rose+'12',
                borderRadius:BR.pill, padding:'2px 8px', flexShrink:0 }}>
                🔁 {e.repeat.charAt(0).toUpperCase()+e.repeat.slice(1)}
              </span>
            )}
            {e.visibility==='shared' && isOwn && e.type !== 'flight' && (
              <span style={{ fontSize:12, color:C.rose, background:C.rose+'15', borderRadius:BR.pill, padding:'2px 8px' }}>◯ Shared by me</span>
            )}
            {(e.visibility==='private' || !e.visibility) && isOwn && e.type !== 'flight' && (
              <span style={{ fontSize:12, color:C.muted, background:C.elevated, borderRadius:BR.pill, padding:'2px 8px', border:`1px solid ${C.border}` }}>🔒 Private</span>
            )}
            {e.visibility==='shared' && !isOwn && e.type !== 'flight' && (
              <span style={{ fontSize:12, color:getDTC(C).meeting, background:C.M+'18',
                borderRadius:BR.pill, padding:'2px 8px' }}>
                👤 {e.userName || 'Team member'}
              </span>
            )}
            {/* Done button — task and reminder only */}
            {(e.type === 'task' || e.type === 'reminder') && isOwn && !isReadOnly && (
              <button onClick={ev => { ev.stopPropagation(); ev.preventDefault(); onToggle && onToggle(e.id); }}
                style={{ fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0,
                  padding:'5px 12px', borderRadius:BR.pill, fontFamily:'inherit',
                  border:`1.5px solid ${e.done ? C.T : C.border}`,
                  background: e.done ? C.T : C.elevated,
                  color: e.done ? '#fff' : C.dim,
                  boxShadow: e.done ? `0 2px 8px ${C.T}40` : 'none',
                  transition:'all 0.15s' }}>
                {e.done ? '✓ Done' : '○ Mark Done'}
              </button>
            )}
            {canEdit && !isReadOnly && (
              <button onClick={openMenu}
                style={{ marginLeft:'auto', fontSize:15, color:C.muted,
                  background:'transparent', border:`1px solid ${C.border}`,
                  borderRadius:BR.input, padding:'6px 13px', cursor:'pointer',
                  letterSpacing:'0.12em', lineHeight:1, flexShrink:0 }}>···</button>
            )}
            {!canEdit && !isReadOnly && (
              <button onClick={ev => { ev.stopPropagation(); setShowDetail(p=>!p); }}
                style={{ marginLeft:'auto', fontSize:12, color:C.muted,
                  background:'transparent', border:`1px solid ${C.border}`,
                  borderRadius:BR.input, padding:'5px 10px', cursor:'pointer',
                  flexShrink:0 }}>{showDetail ? '▲' : '▼'}</button>
            )}
            {isReadOnly && (
              <span style={{ marginLeft:'auto', fontSize:11, color:C.muted,
                fontStyle:'italic', flexShrink:0 }}>
                {e._virtual ? '🔁 repeating' : 'view only'}
              </span>
            )}
          </div>
        ) : !confirmDel ? (
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <button onClick={handleEdit}   style={pill(col+'18', dcol, col+'50')}>✎ Edit</button>
            <button onClick={ev => { ev.stopPropagation(); setOpen(false); canEdit && onCancel && onCancel(e.id, isAdmin); }}
              style={isCancelled
                ? pill(C.T+'18', getDTC(C).task, C.T+'50')
                : pill('#C46A1415', WARN, '#C46A1450')}>
              {isCancelled ? '↩ Uncancel' : '❌ Cancel'}
            </button>
            <button onClick={handleDelReq} style={pill('#C46A1415',WARN,'#C46A1450')}>✕ Delete</button>
            <button onClick={closeMenu}    style={{ ...pill(C.elevated,C.muted,C.border), marginLeft:'auto', padding:'4px 10px' }}>×</button>
          </div>
        ) : (
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:15, color:C.dim, flex:1, fontStyle:'italic' }}>Remove this entry?</span>
            <button onClick={closeMenu}    style={pill(C.elevated,C.dim,C.border)}>Cancel</button>
            <button onClick={handleDelOk}  style={pill('#A04E08','#fff','#A04E08')}>Remove</button>
          </div>
        )}

        {/* Detail panel — shown when card is tapped */}
        {showDetail && !open && (() => {
          const rows = [
            e.date     && ['Date',     (() => { const dt=new Date(e.date+'T00:00:00'); return `${DAY[dt.getDay()]} ${dt.getDate()} ${MON[dt.getMonth()]} ${dt.getFullYear()}`; })()],
            e.time     && ['Time',     `${pt(e.time)}${e.endTime?' – '+pt(e.endTime):''}`],
            e.location && ['Location', e.location],
            e.attendees&& ['Attendees',e.attendees],
            e.flightNum&& ['Flight',   `${e.airline||''} ${e.flightNum}`],
            e.depCity  && ['Route',    `${e.depCity} → ${e.arrCity||'?'}`],
            e.type==='flight' && (() => {
              const tvs = Array.isArray(e.travellers)&&e.travellers.length>0 ? e.travellers : (e.traveller ? [e.traveller] : []);
              const nmap = e.travellerNamesMap||{};
              const entryOwner = e.userId||e.user_id;
              let names;
              if (tvs.length > 0) {
                names = tvs.map(t => {
                  if (t === 'other') return e.travellerName || 'Others';
                  if (nmap[t]) return nmap[t];
                  if (t === entryOwner) return e.userName || 'Me';
                  const wm = wsMembers.find(m => m.id === t);
                  return wm?.name || '';
                }).filter(Boolean).join(', ');
              } else {
                // Legacy entry: no traveller field — owner is the traveller
                names = e.userName || null;
              }
              return names ? ['Travellers', names] : null;
            })(),
            // Entered by — only when owner is NOT a traveller (e.g. logged on behalf of PARENTS)
            e.type==='flight' && e.userName && (() => {
              const tvs2 = Array.isArray(e.travellers)&&e.travellers.length>0 ? e.travellers : (e.traveller ? [e.traveller] : []);
              const owner = e.userId||e.user_id;
              // Legacy (tvs2 empty): owner IS the traveller — don't show Entered by
              if (tvs2.length === 0) return null;
              // Show only if owner not in travellers list
              return !tvs2.includes(owner) ? ['Entered by', e.userName] : null;
            })(),
            e.seat     && ['Seat',     e.seat],
            e.terminal && ['Terminal', e.terminal],
            e.gate     && ['Gate',     e.gate],
            e.tags     && ['Tags',     e.tags],
            e.repeat && e.repeat!=='none' && ['Repeats', e.repeat.charAt(0).toUpperCase()+e.repeat.slice(1)],
            e.message  && ['Message',  e.message],
            e.notes    && ['Notes',    e.notes],
          ].filter(Boolean);

          return (
            <div style={{ marginTop:10, padding:'10px 12px',
              background:C.elevated, borderRadius:BR.input,
              border:`1px solid ${C.border}` }}>
              {/* Detail panel header with close button */}
              <div style={{ display:'flex', alignItems:'center',
                justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:11, fontWeight:700, color:C.muted,
                  textTransform:'uppercase', letterSpacing:'0.1em' }}>
                  {TL[e.type] || e.type} Details
                </span>
                <button onClick={ev => { ev.stopPropagation(); setShowDetail(false); }}
                  style={{ background:'transparent', border:`1px solid ${C.border}`,
                    borderRadius:BR.btn, width:26, height:26, cursor:'pointer',
                    color:C.muted, fontSize:14, fontWeight:700, lineHeight:1,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    flexShrink:0, padding:0 }}>✕</button>
              </div>
              {rows.map(([label, val]) => (
                <div key={label} style={{ display:'flex', gap:8,
                  padding:'5px 0', borderBottom:`1px solid ${C.border}` }}>
                  <span style={{ fontSize:12, fontWeight:700, color:C.muted,
                    textTransform:'uppercase', letterSpacing:'0.07em',
                    flexShrink:0, minWidth:72 }}>{label}</span>
                  <span style={{ fontSize:13, color:C.text, lineHeight:1.5,
                    wordBreak:'break-word' }}>{val}</span>
                </div>
              ))}
              {canEdit && !isReadOnly && (
                <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                  {/* Done button inside detail panel — task and reminder only */}
                  {(e.type === 'task' || e.type === 'reminder') && isOwn && (
                    <button onClick={ev => { ev.stopPropagation(); onToggle && onToggle(e.id); }}
                      style={{ fontSize:13, fontWeight:700, cursor:'pointer',
                        padding:'8px 16px', borderRadius:BR.pill, fontFamily:'inherit',
                        border:`1.5px solid ${e.done ? C.T : C.border}`,
                        background: e.done ? C.T : C.elevated,
                        color: e.done ? '#fff' : C.dim,
                        boxShadow: e.done ? `0 2px 8px ${C.T}40` : 'none',
                        transition:'all 0.15s' }}>
                      {e.done ? '✓ Done' : '○ Mark Done'}
                    </button>
                  )}
                  <button onClick={ev => { ev.stopPropagation(); setShowDetail(false); onEdit && onEdit(e); }}
                    style={pill(col+'18', dcol, col+'50')}>✎ Edit</button>
                  <button onClick={ev => { ev.stopPropagation(); setShowDetail(false); canEdit && onCancel && onCancel(e.id, isAdmin); }}
                    style={isCancelled
                      ? pill(C.T+'18', getDTC(C).task, C.T+'50')
                      : pill('#C46A1415', WARN, '#C46A1450')}>
                    {isCancelled ? '↩ Uncancel' : '❌ Cancel'}
                  </button>
                  <button onClick={ev => { ev.stopPropagation(); setShowDetail(false); setConfirmDel(true); setOpen(true); }}
                    style={pill('#C46A1415',WARN,'#C46A1450')}>✕ Delete</button>
                  <button onClick={ev => { ev.stopPropagation(); setShowDetail(false); }}
                    style={{ ...pill(C.elevated,C.muted,C.border), marginLeft:'auto', padding:'4px 10px' }}>×</button>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── FLIGHT HERO CARD ────────────────────────────────────────────
function FlightHeroCard({ flight, todayStr }) {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  const { status, lastUpdated, loading } = useLiveFlightStatus(flight);
  const depName = airportCity(flight.depCity);
  const arrName = airportCity(flight.arrCity);

  return (
    <div style={{ background:`linear-gradient(135deg,#EDF5FD,#E2EFF8)`,
      border:`1px solid ${C.F}50`,
      borderRadius:BR.card, padding:18, marginBottom:6,
      position:'relative', overflow:'hidden',
      boxShadow:`0 4px 20px ${C.F}20` }}>
      <div style={{ position:'absolute', top:-20, right:-20, width:100, height:100,
        background:`radial-gradient(circle,${C.F}30 0%,transparent 70%)`,
        pointerEvents:'none' }} />

      {/* Airline + flight number + live status badge */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <p style={{ fontSize:14, color:getDTC(C).flight, fontWeight:700, margin:0,
          textTransform:'uppercase', letterSpacing:'0.1em' }}>
          {flight.airline} · {flight.flightNum}
        </p>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {loading && (
            <span style={{ fontSize:11, color:C.dim, fontStyle:'italic' }}>updating…</span>
          )}
          {status && (
            <span style={{ fontSize:12, fontWeight:700, color:'#fff',
              background:status.color, borderRadius:BR.card, padding:'3px 12px',
              letterSpacing:'0.04em', flexShrink:0 }}>
              {status.label}
            </span>
          )}
        </div>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {/* Departure */}
            <div style={{ textAlign:'center' }}>
              <span style={{ fontSize:34, fontWeight:600, color:C.text,
                fontFamily:'Cormorant Garamond,serif', lineHeight:1 }}>
                {flight.depCity}
              </span>
              <p style={{ margin:'2px 0 0', fontSize:12, color:C.dim, lineHeight:1 }}>
                {depName !== flight.depCity ? depName : ''}
              </p>
              {/* Show revised departure time if delayed */}
              {status?.revisedDep && status?.delayMins > 4 && (
                <p style={{ margin:'3px 0 0', fontSize:11, color:'#D4804C', fontWeight:700 }}>
                  {status.delayLabel}
                </p>
              )}
            </div>
            {/* Route line */}
            <div style={{ flex:1, display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ flex:1, height:'1px', background:`linear-gradient(90deg,${getDTC(C).flight}60,transparent)` }} />
              <span style={{ fontSize:16, color:getDTC(C).flight }}>✈</span>
              <div style={{ flex:1, height:'1px', background:`linear-gradient(270deg,${getDTC(C).flight}60,transparent)` }} />
            </div>
            {/* Arrival */}
            <div style={{ textAlign:'center' }}>
              <span style={{ fontSize:34, fontWeight:600, color:C.text,
                fontFamily:'Cormorant Garamond,serif', lineHeight:1 }}>
                {flight.arrCity}
              </span>
              <p style={{ margin:'2px 0 0', fontSize:12, color:C.dim, lineHeight:1 }}>
                {arrName !== flight.arrCity ? arrName : ''}
              </p>
            </div>
          </div>
        </div>
        <div style={{ textAlign:'right', paddingLeft:14 }}>
          <p style={{ fontSize:19, fontWeight:600, color:C.text, margin:0 }}>
            {/* Show revised time if delayed, otherwise scheduled */}
            {status?.revisedDep
              ? pt(status.revisedDep.split('T')[1]?.slice(0,5) || flight.time)
              : pt(flight.time)}
          </p>
          <p style={{ fontSize:15, color:C.dim, margin:'4px 0 0' }}>
            {flight.date===todayStr ? 'Today'
              : flight.date===fd(ad(new Date(),1)) ? 'Tomorrow'
              : flight.date}
          </p>
        </div>
      </div>

      {/* Terminal / Gate / Seat + Passengers chips */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {[
          ['Terminal', status?.terminal || flight.terminal],
          ['Gate',     status?.gate     || flight.gate],
          ['Seat',     flight.seat],
        ].filter(([,v])=>v).map(([k,v]) => (
          <div key={k} style={{ background:'#ffffff60', borderRadius:BR.btn,
            padding:'7px 12px', backdropFilter:'blur(4px)',
            border:`1px solid ${C.F}25` }}>
            <p style={{ fontSize:12, color:C.dim, margin:0, textTransform:'uppercase', letterSpacing:'0.06em' }}>{k}</p>
            <p style={{ fontSize:16, fontWeight:600, color:C.text, margin:'2px 0 0' }}>{v}</p>
          </div>
        ))}
        {(() => {
          const tvs = Array.isArray(flight.travellers)&&flight.travellers.length>0 ? flight.travellers : (flight.traveller ? [flight.traveller] : []);
          if (tvs.length === 0) return null;
          const nmap = flight.travellerNamesMap || {};
          const wsMembers = useContext(WorkspaceContext);
          const names = tvs.map(t => {
            if (t === 'other') return flight.travellerName || 'Others';
            if (nmap[t]) return nmap[t];
            if (t === (flight.userId||flight.user_id)) return flight.userName || 'Me';
            const wm = wsMembers.find(m => m.id === t);
            return wm?.name || '';
          }).filter(Boolean).join(', ');
          if (!names) return null;
          return (
            <div style={{ background:'#ffffff60', borderRadius:BR.btn,
              padding:'7px 12px', backdropFilter:'blur(4px)',
              border:`1px solid ${C.F}25` }}>
              <p style={{ fontSize:12, color:C.dim, margin:0, textTransform:'uppercase', letterSpacing:'0.06em' }}>Travellers</p>
              <p style={{ fontSize:15, fontWeight:600, color:C.text, margin:'2px 0 0' }}>👤 {names}</p>
            </div>
          );
        })()}
      </div>

      {/* Traveller name */}
      {/* Last updated timestamp */}
      {lastUpdated && status?.source !== 'local' && (
        <p style={{ margin:'10px 0 0', fontSize:12, color:C.muted, textAlign:'right', fontStyle:'italic' }}>
          Live data · updated {Math.floor((Date.now()-lastUpdated)/60000) < 1
            ? 'just now'
            : `${Math.floor((Date.now()-lastUpdated)/60000)}m ago`}
        </p>
      )}
    </div>
  );
}
function HomeTab({ entries, onToggle, onCancel, onEdit, onDelete, userName, currentUserId, onAdd, syncStatus, flightSyncCount=0, isAdmin=false, isDark=false, onLocationSummary }) {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  const TC = getTC(C);
  // Single live date source — everything derives from this one value.
  // useState ensures React re-renders atomically when date changes.
  const [now, setNow] = useState(() => new Date());
  const todayStr = fd(now);  // single source of truth for "today"

  // Auto-show Today's Schedule on launch and background return
  const [homeFilter, setHomeFilter] = useState('today');

  // On visibility change: reset date AND filter atomically in one setState batch.
  // React 18 batches multiple setState calls in the same event handler — 
  // both updates happen in the same render cycle with no intermediate state.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        const fresh = new Date();
        const freshStr = fd(fresh);
        setNow(prev => {
          // Only update if day has actually changed — avoids unnecessary re-renders
          if (fd(prev) === freshStr) return prev;
          return fresh;
        });
        setHomeFilter('today'); // always show today's schedule on return
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // All memos derive from todayStr (from now state) — not from new Date() inline.
  // This guarantees they all update together in the same render cycle.
  const todayEs = useMemo(() => {
    const t = todayStr;
    return entries.filter(e => {
      if (e.cancelled) return false;
      const isTR = e.type === 'task' || e.type === 'reminder';

      // ── DATELESS task/reminder ───────────────────────────────────
      if (isTR && !e.date) {
        if (!e.done) return true;                          // always show if undone
        const cd = e.doneAt ? e.doneAt.slice(0,10) : null;
        return cd === t;                                   // done: only on completion day
      }

      // ── DATED task/reminder ──────────────────────────────────────
      if (isTR && e.date) {
        if (!e.done) return e.date <= t;                  // undone: show if due today or overdue
        // Done: show on completion date only
        const cd = e.doneAt ? e.doneAt.slice(0,10) : e.date;
        return cd === t;
      }

      // ── All other entry types (flights, birthdays, etc.) ─────────
      return e.date === t;

    }).sort((a,b) => (a.time||'99:99').localeCompare(b.time||'99:99'));
  }, [entries, todayStr]);

  const nextFlight = useMemo(() =>
    entries.filter(e => e.type==='flight' && !e.cancelled && e.date >= todayStr)
           .sort((a,b) => a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||''))[0],
    [entries, todayStr]);

  const topTasks = useMemo(() =>
    entries.filter(e => e.type==='task' && !e.done && !e.cancelled)
           .sort((a,b) => (a.date||'9999').localeCompare(b.date||'9999'))
           .slice(0,3),
    [entries]);

  const openTasks = useMemo(() =>
    entries.filter(e => e.type==='task' && !e.done && !e.cancelled).length,
    [entries]);

  const next48 = useMemo(() => {
    const lim = new Date(now.getTime() + 48 * 3600000);
    return entries.filter(e => {
      const d = new Date(e.date + 'T' + (e.time||'00:00'));
      return d >= now && d <= lim && e.type !== 'task' && !e.cancelled;
    }).length;
  }, [entries, now]);

  const hr    = now.getHours();
  const greet = hr<12?'Good Morning':hr<17?'Good Afternoon':'Good Evening';

  return (
    <div style={{ overflowY:'auto', height:'100%', boxSizing:'border-box' }}>

      {/* ── Kizuna Brand Header ─────────────────────────────────── */}
      <div style={{ background: isDark
          ? `linear-gradient(160deg, ${C.card} 0%, ${C.elevated} 60%, ${C.bg} 100%)`
          : `linear-gradient(160deg, #FFFEFB 0%, #FDF5EE 60%, #F8EDE4 100%)`,
        padding:'18px 20px 16px',
        borderBottom:`1px solid ${C.border}`,
        position:'relative', overflow:'hidden',
        boxShadow: isDark
          ? `0 3px 12px rgba(0,0,0,0.25)`
          : `0 3px 12px rgba(184,113,92,0.08)` }}>

        {/* Decorative rose glow — top right */}
        <div style={{ position:'absolute', top:-30, right:-20, width:160, height:160,
          background:`radial-gradient(circle, ${C.rose}18 0%, transparent 70%)`,
          pointerEvents:'none' }} />
        {/* Decorative glow — bottom left */}
        <div style={{ position:'absolute', bottom:-20, left:-10, width:100, height:100,
          background:`radial-gradient(circle, ${C.M}12 0%, transparent 70%)`,
          pointerEvents:'none' }} />

        <div style={{ display:'flex', alignItems:'flex-start',
          justifyContent:'space-between', position:'relative' }}>
          <div style={{ flex:1, minWidth:0 }}>
            {/* App name */}
            <h1 style={{ margin:'0 0 2px', fontSize:'clamp(30px, 8vw, 38px)',
              fontWeight:700, color:C.text,
              fontFamily:'Cormorant Garamond,serif', lineHeight:1,
              letterSpacing:'-0.01em' }}>
              Kizuna&thinsp;<span style={{ color:C.rose }}>絆</span>
            </h1>
            {/* Tagline — fluid font sizes for all screen widths */}
            <p style={{ margin:'10px 0 0', fontSize:'clamp(14px, 4vw, 18px)',
              color:C.rose, fontFamily:'Cormorant Garamond,serif',
              lineHeight:1.4, fontWeight:600, letterSpacing:'0.01em' }}>
              Bonding with trust, loyalty & love
            </p>
            <p style={{ margin:'2px 0 0', fontSize:'clamp(12px, 3.4vw, 16px)',
              color:C.dim, fontStyle:'italic',
              fontFamily:'Cormorant Garamond,serif', lineHeight:1.6 }}>
              Nurturing the invisible thread that connects hearts across time and distance
            </p>
          </div>
          {/* Sakura icon — static flowers + animated falling petals */}
          <div style={{ flexShrink:0, marginTop:2, transform:'scale(1.3)',
            transformOrigin:'top right', position:'relative' }}>
            <SeasonIcon />
            <SeasonParticles />
          </div>
        </div>
      </div>

      <div style={{ padding:'16px 18px 90px' }}>
        {/* Greeting */}
        <div style={{ marginBottom:18 }}>
          <p style={{ fontSize:14, color:C.dim, margin:'0 0 2px', fontStyle:'italic' }}>{greet}</p>
          <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
            <h2 style={{ fontSize:34, fontFamily:'Cormorant Garamond,Georgia,serif',
              fontWeight:600, color:C.rose, margin:0, lineHeight:1.1 }}>
              {userName || 'Welcome'}
            </h2>
            {/* Sync status — word label right of name */}
            <span style={{ fontSize:12, fontWeight:700, letterSpacing:'0.05em',
              color: syncStatus==='synced' ? C.T : syncStatus==='error' ? WARN : C.rose,
              background: syncStatus==='synced' ? C.T+'18' : syncStatus==='error' ? '#C46A1415' : C.rose+'18',
              borderRadius:BR.pill, padding:'3px 10px', flexShrink:0,
              border:`1px solid ${syncStatus==='synced' ? C.T : syncStatus==='error' ? WARN : C.rose}40` }}>
              {syncStatus==='loading' ? 'Syncing…' : syncStatus==='synced' ? 'Synced' : 'Sync Error'}
            </span>
          </div>
          <p style={{ fontSize:15, color:C.dim, margin:'4px 0 0' }}>
            {DAY[now.getDay()]}, {MFULL[now.getMonth()]} {now.getDate()} · {todayEs.length} items today
          </p>
        </div>

        {/* Tappable stat cards — always visible, tap to reveal filtered entries below */}
        {(() => {
          const filters = [
            { key:'tasks',   val:openTasks,        label:'Open Tasks', c:C.T,  dc:getDTC(C).task,    icon:'✓',
              entries: entries.filter(e=>e.type==='task'&&!e.done&&!e.cancelled&&(!e.repeat||e.repeat==='none')).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')) },
            { key:'next48',  val:next48,           label:'Next 48h',   c:C.E,  dc:getDTC(C).event,   icon:'⏱',
              entries: (() => { const n=new Date(),lim=new Date(n.getTime()+48*3600000);
                return entries.filter(e=>{ const d=new Date(e.date+'T'+(e.time||'00:00'));
                  return d>=n&&d<=lim&&e.type!=='task'&&!e.cancelled&&(!e.repeat||e.repeat==='none'); })
                  .sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'')); })() },
          ];
          return (<>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:8 }}>
              {/* Date card — first widget, same size/shape/elevation as others */}
              {(() => {
                const active = homeFilter === 'today';
                return (
                  <button onClick={() => setHomeFilter(p => p==='today' ? null : 'today')}
                    style={{ background: active
                        ? `linear-gradient(145deg,${C.rose},${C.rose}CC)`
                        : `linear-gradient(145deg,${C.card},${C.rose}10)`,
                      borderRadius:BR.card, padding:'16px 12px',
                      textAlign:'center', boxShadow: active ? `0 4px 16px ${C.rose}40` : SH.card,
                      border:`1.5px solid ${active ? C.rose : C.rose}`,
                      cursor:'pointer', transition:'all 0.15s',
                      display:'flex', flexDirection:'column', alignItems:'center',
                      justifyContent:'center', gap:0 }}>
                    <div style={{ fontSize:11, fontWeight:800, letterSpacing:'0.12em',
                      textTransform:'uppercase', lineHeight:1,
                      color: active ? '#fff' : C.rose, marginBottom:2 }}>
                      {MON[now.getMonth()]}
                    </div>
                    <div style={{ fontSize:28, fontWeight:700,
                      fontFamily:'Cormorant Garamond,serif',
                      color: active ? '#fff' : C.rose, lineHeight:1 }}>
                      {now.getDate()}
                    </div>
                    <div style={{ fontSize:12, marginTop:5, fontWeight:600,
                      textTransform:'uppercase', letterSpacing:'0.07em',
                      color: active ? '#fff' : C.dim }}>Today</div>
                  </button>
                );
              })()}
              {filters.map(f => {
                const active = homeFilter===f.key;
                return (
                  <button key={f.key} onClick={() => setHomeFilter(p=>p===f.key?null:f.key)}
                    style={{ background: active
                        ? `linear-gradient(145deg,${f.c},${f.c}CC)`
                        : `linear-gradient(145deg,${C.card},${f.c}10)`,
                      borderRadius:BR.card, padding:'16px 12px',
                      textAlign:'center', boxShadow: active ? `0 4px 16px ${f.c}40` : SH.card,
                      border:`1.5px solid ${active ? f.c : f.c}${active ? '' : '25'}`,
                      cursor:'pointer', transition:'all 0.15s' }}>
                    <div style={{ fontSize:18, marginBottom:4, opacity:0.8 }}>{f.icon}</div>
                    <div style={{ fontSize:28, fontWeight:700,
                      fontFamily:'Cormorant Garamond,serif',
                      color: active ? '#fff' : f.dc, lineHeight:1 }}>{f.val}</div>
                    <div style={{ fontSize:12, marginTop:5, fontWeight:600,
                      textTransform:'uppercase', letterSpacing:'0.07em',
                      color: active ? '#fff' : C.dim }}>{f.label}</div>
                  </button>
                );
              })}
            </div>
            {/* Filtered entries panel — shown for tasks/next48 only; today uses Today's Schedule below */}
            {homeFilter && homeFilter !== 'today' && (() => {
              const f = filters.find(x=>x.key===homeFilter);
              if (!f) return null;
              return (
                <div style={{ background:C.card, borderRadius:BR.card,
                  border:`1px solid ${f.c}30`, boxShadow:SH.card, marginBottom:8,
                  padding: f.entries.length ? '0 14px' : '16px 14px' }}>
                  {f.entries.length === 0
                    ? <p style={{ margin:0, fontSize:15, color:C.muted,
                        textAlign:'center', fontStyle:'italic' }}>
                        Nothing here yet
                      </p>
                    : f.entries.map(e => <ECard key={e.id} e={e}
                        onToggle={onToggle} onCancel={onCancel} onEdit={onEdit}
                        onDelete={onDelete} currentUserId={currentUserId} />)
                  }
                </div>
              );
            })()}
          </>);
        })()}

        {/* 📍 Location Summary button */}
        {onLocationSummary && (
          <button onClick={onLocationSummary} style={{
            width:'100%', marginBottom:8,
            padding:'12px 16px', borderRadius:BR.card,
            background:C.card, border:`1px solid ${C.border}`,
            boxShadow:SH.card, cursor:'pointer',
            display:'flex', alignItems:'center', gap:10, textAlign:'left',
          }}>
            <span style={{ fontSize:20 }}>📍</span>
            <span style={{ flex:1, fontSize:15, fontWeight:600, color:C.text }}>
              My Location Summary
            </span>
            <span style={{ fontSize:13, color:C.muted }}>›</span>
          </button>
        )}

        {/* Next Flight — only shown when no filter card is active */}
        {!homeFilter && nextFlight && (<>
          <Sec label="Next Flight" />
          <FlightHeroCard flight={nextFlight} todayStr={todayStr} />
        </>)}

        {/* Pending Tasks — only shown when no filter active */}
        {!homeFilter && topTasks.length > 0 && (<>
          <Sec label="Pending Tasks" count={openTasks} />
          <div style={{ background:C.card, borderRadius:BR.card, padding:'0 14px',
            boxShadow:SH.card, border:`1px solid ${C.border}` }}>
            {topTasks.map(e => <ECard key={e.id} e={e} onToggle={onToggle} onCancel={onCancel} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} isAdmin={isAdmin} />)}
          </div>
        </>)}

        {/* Today's Schedule — shown ONLY when Today filter card is pressed */}
        {homeFilter === 'today' && (<>
          <Sec label="Today's Schedule" count={todayEs.length} />
          {todayEs.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 18px',
              background:C.card, borderRadius:BR.card,
              border:`1px solid ${C.border}`, boxShadow:SH.subtle }}>
              <div style={{ fontSize:36, marginBottom:10, opacity:0.4 }}>🌸</div>
              <p style={{ margin:'0 0 4px', fontSize:16, fontWeight:600, color:C.dim }}>
                A peaceful day ahead
              </p>
              <button onClick={onAdd}
                style={{ marginTop:10, background:C.rose, border:'none', color:'#fff',
                  borderRadius:BR.btn, padding:'10px 24px', fontSize:15, fontWeight:700,
                  cursor:'pointer', fontFamily:'inherit',
                  boxShadow:`0 4px 14px ${C.rose}40` }}>
                + Schedule something
              </button>
            </div>
          ) : (
            <div style={{ background:C.card, borderRadius:BR.card, padding:'0 14px',
              boxShadow:SH.card, border:`1px solid ${C.border}` }}>
              {todayEs.map(e => <ECard key={e.id} e={e} onToggle={onToggle} onCancel={onCancel} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} isAdmin={isAdmin} />)}
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}

// ─── AGENDA VIEW ─────────────────────────────────────────────────
function AgendaView({ entries, onToggle, onCancel, onEdit, onDelete, currentUserId, onAdd }) {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  const TC = getTC(C);
  const grouped = useMemo(() => {
    const sorted = [...entries].sort((a,b) =>
      a.date.localeCompare(b.date) || (a.time||'99:99').localeCompare(b.time||'99:99'));
    const map = {};
    sorted.forEach(e => { (map[e.date] = map[e.date]||[]).push(e); });
    return map;
  }, [entries]);
  const dates = Object.keys(grouped).sort();

  return (
    <div style={{ overflowY:'auto', height:'100%', padding:'0 18px 90px', boxSizing:'border-box' }}>
      {dates.length === 0 ? (        <div style={{ textAlign:'center', padding:'60px 24px' }}>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:12,
            opacity:0.4, color:C.rose, transform:'scale(2)', transformOrigin:'center' }}>
            <CalIcon />
          </div>
          <p style={{ fontSize:16, fontWeight:600, color:C.dim, margin:'24px 0 6px' }}>
            Nothing scheduled yet
          </p>
          <p style={{ fontSize:14, color:C.muted, fontStyle:'italic', margin:'0 0 20px' }}>
            Your upcoming entries will appear here
          </p>
          <button onClick={() => onAdd(fd(new Date()))}
            style={{ background:C.rose, border:'none', color:'#fff',
              borderRadius:BR.btn, padding:'12px 28px', fontSize:15, fontWeight:700,
              cursor:'pointer', fontFamily:'inherit',
              boxShadow:`0 4px 14px ${C.rose}40` }}>
            + Schedule something
          </button>
        </div>
      ) : dates.map(d => {
        const dt     = new Date(d+'T00:00:00');
        const isT    = d === fd(new Date());
        const isPast = dt < new Date();
        return (
          <div key={d} style={{ marginTop:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
              <div style={{ width:44, height:44, borderRadius:BR.input, flexShrink:0,
                background: isT
                  ? `linear-gradient(135deg,${C.rose},${C.roseL})`
                  : isPast
                    ? C.elevated
                    : `linear-gradient(135deg,${C.card},${C.M}12)`,
                boxShadow: isT ? `0 4px 16px ${C.rose}35` : SH.subtle,
                border: isT ? 'none' : `1px solid ${C.border}`,
                display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                <span style={{ fontSize:11, fontWeight:700, color:isT?'#fff':C.dim,
                  lineHeight:1, textTransform:'uppercase' }}>{DAY[dt.getDay()]}</span>
                <span style={{ fontSize:20, fontWeight:700, color:isT?'#fff':C.text, lineHeight:1.2 }}>
                  {dt.getDate()}
                </span>
              </div>
              <span style={{ fontSize:16, color:isT?C.rose:C.dim, fontStyle:isT?'italic':'normal' }}>
                {isT ? 'Today — ' : ''}{MFULL[dt.getMonth()]} {dt.getFullYear()}
              </span>
            </div>
            <div style={{ background:C.card, borderRadius:BR.card, padding:'0 14px',
              boxShadow:SH.card, border:`1px solid ${C.border}` }}>
              {grouped[d].map(e => <ECard key={e.id} e={e} onToggle={onToggle} onCancel={onCancel} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} isAdmin={isAdmin} />)}
            </div>
          </div>
        );
      })}
      </div>
  );
}
function DayView({ entries, selDate, setSelDate, onToggle, onCancel, onEdit, onDelete, currentUserId, onAdd }) {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  const TC = getTC(C);
  const dayEs = useMemo(() => entries.filter(e => e.date===selDate && e.time), [entries, selDate]);
  const allDayEs = useMemo(() => entries.filter(e => e.date===selDate && !e.time), [entries, selDate]);
  const hours  = Array.from({ length:24 }, (_,i) => i); // 00:00 → 23:00
  const dt     = new Date(selDate+'T00:00:00');

  const NavBtn = ({ children, onClick }) => (
    <button onClick={onClick} style={{ background:C.card, border:`1px solid ${C.border}`,
      color:C.text, borderRadius:BR.btn, padding:'7px 16px', cursor:'pointer',
      fontSize:20, boxShadow:SH.subtle }}>{children}</button>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 18px',
        borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.card }}>
        <NavBtn onClick={() => { const d=new Date(selDate+'T00:00:00'); d.setDate(d.getDate()-1); setSelDate(fd(d)); }}>‹</NavBtn>
        <div style={{ flex:1, textAlign:'center' }}>
          <p style={{ margin:0, fontSize:16, fontWeight:600, color:C.text }}>
            {DAY[dt.getDay()]}, {MFULL[dt.getMonth()]} {dt.getDate()}
          </p>
          {selDate===fd(new Date()) && (
            <p style={{ margin:0, fontSize:14, color:C.rose, fontStyle:'italic' }}>Today</p>
          )}
        </div>
        <NavBtn onClick={() => { const d=new Date(selDate+'T00:00:00'); d.setDate(d.getDate()+1); setSelDate(fd(d)); }}>›</NavBtn>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'0 18px 90px', boxSizing:'border-box' }}>
        {/* All-day entries (no time) shown at top */}
        {allDayEs.length > 0 && (
          <div style={{ background:C.card, borderRadius:BR.input, padding:'0 12px',
            border:`1px solid ${C.border}`, margin:'8px 0 4px',
            boxShadow:SH.subtle }}>
            <p style={{ fontSize:12, color:C.muted, margin:'8px 0 2px',
              textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:700 }}>All day</p>
            {allDayEs.map(e => <ECard key={e.id} e={e} onToggle={onToggle} onCancel={onCancel} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} isAdmin={isAdmin} />)}
          </div>
        )}
        {/* Hourly slots */}
        {hours.map(h => {
          const hEs = dayEs.filter(e => parseInt(e.time.split(':')[0])===h);
          return (
            <div key={h} style={{ display:'flex', gap:12, minHeight:48 }}>
              <div style={{ width:48, paddingTop:10, flexShrink:0, textAlign:'right' }}>
                <span style={{ fontSize:13, color: h===0||h===12 ? C.text : C.muted,
                  fontWeight: h===0||h===12 ? 600 : 400 }}>
                  {h===0?'12 AM':h<12?`${h} AM`:h===12?'12 PM':`${h-12} PM`}
                </span>
              </div>
              <div style={{ flex:1, borderTop:`1px solid ${C.border}`, paddingTop:4, paddingBottom:4 }}>
                {hEs.length > 0 && (
                  <div style={{ background:C.card, borderRadius:BR.input, padding:'0 12px',
                    boxShadow:SH.card, border:`1px solid ${C.border}` }}>
                    {hEs.map(e => (
                      <ECard key={e.id} e={e} onToggle={onToggle} onCancel={onCancel} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── WEEK VIEW ───────────────────────────────────────────────────
function WeekView({ entries, selDate, setSelDate, onToggle, onCancel, onEdit, onDelete, currentUserId, onAdd }) {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  const TC = getTC(C);
  const dt        = new Date(selDate+'T00:00:00');
  const dow       = dt.getDay();
  const weekStart = new Date(dt);
  weekStart.setDate(dt.getDate() - (dow===0?6:dow-1));
  const days = Array.from({ length:7 }, (_,i) => ad(weekStart,i));

  // Entries for each day in week — used for dots
  const weekEntries = useMemo(() =>
    Object.fromEntries(days.map(d => {
      const ds = fd(d);
      return [ds, entries.filter(e=>e.date===ds).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'))];
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [entries, fd(weekStart)]);

  // Selected day's entries
  const selDayEs = weekEntries[selDate] || [];
  const selIsPast = new Date(selDate+'T23:59:59') < new Date();

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Week navigation header */}
      <div style={{ display:'flex', alignItems:'center', padding:'8px 18px',
        borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.card }}>
        <button onClick={() => { const d=new Date(selDate+'T00:00:00'); d.setDate(d.getDate()-7); setSelDate(fd(d)); }}
          style={{ background:C.elevated, border:`1px solid ${C.border}`, color:C.text,
            borderRadius:BR.btn, padding:'7px 14px', cursor:'pointer', fontSize:20 }}>‹</button>
        <span style={{ flex:1, textAlign:'center', fontSize:16, color:C.dim, fontWeight:600 }}>
          {MON[weekStart.getMonth()]} {weekStart.getDate()} – {MON[days[6].getMonth()]} {days[6].getDate()}
        </span>
        <button onClick={() => { const d=new Date(selDate+'T00:00:00'); d.setDate(d.getDate()+7); setSelDate(fd(d)); }}
          style={{ background:C.elevated, border:`1px solid ${C.border}`, color:C.text,
            borderRadius:BR.btn, padding:'7px 14px', cursor:'pointer', fontSize:20 }}>›</button>
      </div>

      {/* 7-day picker row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)',
        padding:'4px 6px', flexShrink:0, borderBottom:`1px solid ${C.border}`,
        background:C.card }}>
        {days.map(d => {
          const ds=fd(d); const isT=ds===fd(new Date()); const isSel=ds===selDate;
          const isPast = d < new Date() && !isT;
          const dots = [...new Set((weekEntries[ds]||[]).map(e=>TC[e.type]))].slice(0,3);
          return (
            <button key={ds} onClick={() => setSelDate(ds)}
              style={{ background:'transparent', border:'none',
                cursor:'pointer',
                padding:'6px 2px', textAlign:'center',
                opacity: isPast ? 0.45 : 1 }}>
              <div style={{ fontSize:11, color:isT?C.rose:C.muted, marginBottom:2,
                textTransform:'uppercase', letterSpacing:'0.05em' }}>
                {DAY[d.getDay()]}
              </div>
              <div style={{ width:32, height:32, borderRadius:BR.panel, margin:'0 auto',
                background: isSel?C.rose : isT?C.rose+'22':'transparent',
                border: isT&&!isSel?`1.5px solid ${C.rose}60`:'1.5px solid transparent',
                boxShadow: isSel?`0 2px 10px ${C.rose}40`:'none',
                display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span style={{ fontSize:15, fontWeight:isSel?700:400,
                  color:isSel?'#fff':isT?C.rose:C.text }}>{d.getDate()}</span>
              </div>
              {/* Entry count dot or dots */}
              <div style={{ display:'flex', justifyContent:'center', gap:2, marginTop:4, height:7 }}>
                {dots.map((col,j) => (
                  <div key={j} style={{ width:7, height:7, borderRadius:4, background:col,
                    boxShadow:`0 1px 3px ${col}50` }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected day's entries */}
      <div style={{ flex:1, overflowY:'auto', padding:'8px 18px 90px', boxSizing:'border-box' }}>
        {selDayEs.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px 18px',
            background:C.card, borderRadius:BR.card, margin:'8px 0',
            border:`1px solid ${C.border}`, boxShadow:SH.subtle }}>
            <p style={{ margin:'0 0 6px', fontSize:16, fontWeight:600, color:C.dim }}>
              Nothing on {DAY[new Date(selDate+'T00:00:00').getDay()]}, {MFULL[new Date(selDate+'T00:00:00').getMonth()]} {new Date(selDate+'T00:00:00').getDate()}
            </p>
            <button onClick={() => onAdd(selDate)}
              style={{ marginTop:10, background:C.rose, border:'none', color:'#fff',
                borderRadius:BR.btn, padding:'10px 24px', fontSize:15, fontWeight:700,
                cursor:'pointer', fontFamily:'inherit',
                boxShadow:`0 4px 14px ${C.rose}40` }}>
              + Schedule something
            </button>
          </div>
        ) : (
          <div style={{ background:C.card, borderRadius:BR.card, padding:'0 14px',
            boxShadow:SH.card, border:`1px solid ${C.border}` }}>
            {selDayEs.map(e => (
              <ECard key={e.id} e={e} onToggle={onToggle} onCancel={onCancel} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} readOnly={selIsPast} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MONTH VIEW ──────────────────────────────────────────────────
function MonthView({ entries, selDate, setSelDate, vm, setVm, goToday, isToday, onToggle, onCancel, onEdit, onDelete, currentUserId, onAdd, isAdmin=false, onSyncFlights, flightSyncCount=0, isDark=false, showFlags=false, locationMap={} }) {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  const TC = getTC(C);
  const daysInMonth = new Date(vm.y, vm.m+1, 0).getDate();
  const first       = new Date(vm.y, vm.m, 1);
  const offset      = first.getDay()===0 ? 6 : first.getDay()-1;
  const cells       = [...Array(offset).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)];
  const selDayEs    = entries.filter(e=>e.date===selDate)
                             .sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));
  const [showFlights, setShowFlights] = useState(false);
  const [expandedCalHoliday, setExpandedCalHoliday] = useState(null);
  const flightRefs  = useRef({});

  // Reset expanded holiday when date changes
  useEffect(() => { setExpandedCalHoliday(null); }, [selDate]);

  // All flights in current month — sorted by date then time
  const monthFlights = useMemo(() =>
    entries.filter(e => e.type==='flight' && !e.cancelled &&
      e.date?.startsWith(`${vm.y}-${p2(vm.m+1)}`))
      .sort((a,b) => (a.date||'').localeCompare(b.date||'') || (a.time||'').localeCompare(b.time||'')),
    [entries, vm.y, vm.m]);

  // Flight lookup by date for grid overlay
  const flightsByDate = useMemo(() => {
    const map = {};
    monthFlights.forEach(e => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, [monthFlights]);

  const today = fd(new Date());

  const handleFlightDateClick = (ds) => {
    setSelDate(ds);
    // Scroll to first flight card for that date
    setTimeout(() => {
      const ref = flightRefs.current[ds];
      if (ref) ref.scrollIntoView({ behavior:'smooth', block:'center' });
    }, 80);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Nav row */}
      <div style={{ display:'flex', alignItems:'center', padding:'8px 18px',
        borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.card }}>
        <button onClick={() => {
            const nvm = vm.m===0?{y:vm.y-1,m:11}:{y:vm.y,m:vm.m-1};
            setVm(nvm); setSelDate(`${nvm.y}-${p2(nvm.m+1)}-01`);
          }}
          style={{ background:C.elevated, border:`1px solid ${C.border}`, color:C.text,
            borderRadius:BR.btn, padding:'7px 14px', cursor:'pointer', fontSize:20 }}>‹</button>
        <span style={{ flex:1, textAlign:'center', fontSize:19, fontWeight:600,
          color:C.text, fontFamily:'Cormorant Garamond,serif' }}>
          {MFULL[vm.m]} {vm.y}
        </span>
        {/* Today pill */}
        {goToday && (
          <button onClick={goToday}
            style={{ padding:'5px 12px', borderRadius:BR.pill,
              border:`1.5px solid ${C.rose}`,
              background: isToday ? C.rose : 'transparent',
              color: isToday ? '#fff' : C.rose,
              fontSize:12, fontWeight:700, cursor:'pointer',
              marginRight:6, flexShrink:0, transition:'all 0.15s' }}>
            Today
          </button>
        )}
        {/* ✈ Flights toggle */}
        <button onClick={() => setShowFlights(p => !p)}
          style={{ padding:'5px 11px', borderRadius:BR.pill,
            border:`1.5px solid ${showFlights ? C.F : C.border}`,
            background: showFlights
              ? `linear-gradient(135deg,${C.F},${C.M})`
              : 'transparent',
            color: showFlights ? '#fff' : C.dim,
            fontSize:12, fontWeight:700, cursor:'pointer',
            marginRight: showFlights ? 4 : 8, flexShrink:0,
            boxShadow: showFlights ? `0 2px 10px ${C.F}50` : 'none',
            transition:'all 0.2s', display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ fontSize:13 }}>✈</span>
          <span>{monthFlights.length > 0 ? `${monthFlights.length}` : ''}</span>
        </button>
        {/* 📍 Flag toggle */}
        <button
          onClick={() => {
            const next = !showFlags;
            localStorage.setItem('kizuna_cal_flags', String(next));
            // bubble up via onAdd hack — use a custom event instead
            window.dispatchEvent(new CustomEvent('kizuna_flags_toggle', { detail: next }));
          }}
          style={{ padding:'5px 9px', borderRadius:BR.pill, marginRight:8,
            border:`1.5px solid ${showFlags ? C.rose : C.border}`,
            background: showFlags ? C.rose+'22' : 'transparent',
            color: showFlags ? C.rose : C.muted,
            fontSize:13, cursor:'pointer', flexShrink:0,
            transition:'all 0.2s' }}>
          📍
        </button>
        {/* Manual flight refresh button — only shown in flight mode */}
        {showFlights && onSyncFlights && (
          <button onClick={onSyncFlights}
            disabled={flightSyncCount > 0}
            style={{ padding:'5px 10px', borderRadius:BR.pill, marginRight:8,
              border:`1.5px solid ${C.F}`,
              background: flightSyncCount > 0 ? C.elevated : 'transparent',
              color: flightSyncCount > 0 ? C.muted : C.F,
              fontSize:12, fontWeight:700, cursor: flightSyncCount > 0 ? 'default' : 'pointer',
              flexShrink:0, transition:'all 0.2s',
              display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ display:'inline-block',
              animation: flightSyncCount > 0 ? 'spin 1s linear infinite' : 'none' }}>
              {flightSyncCount > 0 ? '⟳' : '↻'}
            </span>
            <span>{flightSyncCount > 0 ? `${flightSyncCount}` : ''}</span>
          </button>
        )}
        <button onClick={() => {
            const nvm = vm.m===11?{y:vm.y+1,m:0}:{y:vm.y,m:vm.m+1};
            setVm(nvm); setSelDate(`${nvm.y}-${p2(nvm.m+1)}-01`);
          }}
          style={{ background:C.elevated, border:`1px solid ${C.border}`, color:C.text,
            borderRadius:BR.btn, padding:'7px 14px', cursor:'pointer', fontSize:20 }}>›</button>
      </div>

      {/* Weekday labels */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)',
        padding:'6px 6px 0', flexShrink:0, background:C.card }}>
        {['M','T','W','T','F','S','S'].map((d,i) => (
          <div key={i} style={{ textAlign:'center', fontSize:14, color:C.muted,
            fontWeight:600, padding:'3px 0' }}>{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ padding:'0 6px', flexShrink:0, background:C.card }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
          {cells.map((day,i) => {
            if (!day) return <div key={`e${i}`} style={{ height: showFlights ? 56 : 42 }} />;
            const ds      = `${vm.y}-${p2(vm.m+1)}-${p2(day)}`;
            const isT     = ds===fd(new Date()), isSel = ds===selDate;
            const isPast  = new Date(ds+'T00:00:00') < new Date() && !isT;
            const dots    = showFlights
              ? [] // hide dots in flight mode — route labels replace them
              : [...new Set(entries.filter(e=>e.date===ds).map(e=>TC[e.type]))].slice(0,3);
            const dayFlights  = flightsByDate[ds] || [];
            const hasFlight   = dayFlights.length > 0;
            const dayHolidays = HOLIDAYS_BY_DATE[ds] || [];
            const hasHoliday  = dayHolidays.length > 0;

            return (
              <button key={ds}
                onClick={() => hasFlight && showFlights
                  ? handleFlightDateClick(ds)
                  : setSelDate(ds)}
                style={{ background:'transparent', border:'none', cursor:'pointer',
                  padding:'3px 1px', textAlign:'center',
                  opacity: isPast ? (showFlights && hasFlight ? 0.5 : 0.4) : 1 }}>
                {/* Day number circle */}
                <div style={{ width:32, height:32, borderRadius:BR.panel, margin:'0 auto',
                  background: isSel ? (showFlights && hasFlight ? C.F : C.rose)
                    : isT ? (showFlights && hasFlight ? C.F+'20' : C.rose+'20')
                    : hasHoliday && !showFlights
                      ? (isDark
                          ? `${HC[dayHolidays[0].country]||'#EF3340'}22`
                          : HC_LIGHT[dayHolidays[0].country]||'#FEE8EA')
                      : 'transparent',
                  border: isSel ? 'none'
                    : hasHoliday && !showFlights
                      ? `1.5px solid ${HC[dayHolidays[0].country]||'#EF3340'}${isDark?'50':'40'}`
                      : isT ? `1.5px solid ${showFlights && hasFlight ? '#5BB8E880' : '#B8715C60'}`
                      : '1.5px solid transparent',
                  boxShadow: isSel ? `0 2px 12px ${showFlights&&hasFlight?C.F:C.rose}35` : 'none',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  position:'relative' }}>
                  <span style={{ fontSize:15, fontWeight:isSel?700:400,
                    color: isSel ? '#fff'
                      : isT ? (showFlights&&hasFlight?C.F:C.rose)
                      : showFlights&&hasFlight ? C.F
                      : hasHoliday ? HC[dayHolidays[0].country]||'#EF3340'
                      : C.text }}>{day}</span>
                  {/* Flight indicator dot */}
                  {showFlights && hasFlight && !isSel && (
                    <div style={{ position:'absolute', top:2, right:2,
                      width:6, height:6, borderRadius:3,
                      background: isPast ? C.F+'80' : C.F,
                      boxShadow:`0 0 4px ${C.F}60` }} />
                  )}
                  {/* Holiday indicator dot */}
                  {hasHoliday && !showFlights && !isSel && (
                    <div style={{ position:'absolute', bottom:2, right:2,
                      width:5, height:5, borderRadius:3,
                      background: HC[dayHolidays[0].country]||'#EF3340' }} />
                  )}
                </div>
                {/* Flight mode: show DEP→ARR route text */}
                {showFlights && hasFlight ? (
                  <div style={{ marginTop:3, lineHeight:1.2 }}>
                    {dayFlights.slice(0,2).map((f,fi) => (
                      <div key={fi} style={{ fontSize:9, fontWeight:700,
                        color: isPast ? C.F+'70' : C.F,
                        letterSpacing:'0.04em',
                        whiteSpace:'nowrap', margin:'0 auto' }}>
                        {(f.depCity||'???').slice(0,3).toUpperCase()}-{(f.arrCity||'???').slice(0,3).toUpperCase()}
                      </div>
                    ))}
                    {dayFlights.length > 2 && (
                      <div style={{ fontSize:8, color:C.muted }}>+{dayFlights.length-2}</div>
                    )}
                  </div>
                ) : showFlags && locationMap[ds] ? (
                  /* Country flag badge */
                  <div style={{ fontSize:11, lineHeight:1, marginTop:2, textAlign:'center' }}>
                    {countryFlag(locationMap[ds].country_code)}
                  </div>
                ) : (
                  /* Normal dots */
                  <div style={{ display:'flex', justifyContent:'center', gap:3, marginTop:2, height:7 }}>
                    {dots.map((col,j) => (
                      <div key={j} style={{ width:7, height:7, borderRadius:4, background:col+'90' }} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom section — flight mode shows all month flights; normal shows selected day */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 18px 90px',
        borderTop:`1px solid ${C.border}`, marginTop:8, boxSizing:'border-box' }}>

        {showFlights ? (<>
          {/* Flight mode header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'10px 0 8px' }}>
            <p style={{ margin:0, fontSize:12, color:C.F, fontWeight:700,
              textTransform:'uppercase', letterSpacing:'0.12em' }}>
              ✈ {monthFlights.length} Flight{monthFlights.length!==1?'s':''} · {MFULL[vm.m]}
            </p>
            <button onClick={() => setShowFlights(false)}
              style={{ fontSize:12, color:C.muted, background:'transparent',
                border:`1px solid ${C.border}`, borderRadius:BR.pill,
                padding:'3px 10px', cursor:'pointer' }}>Done</button>
          </div>

          {monthFlights.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 18px',
              background:C.card, borderRadius:BR.card,
              border:`1px solid ${C.border}`, boxShadow:SH.subtle }}>
              <div style={{ fontSize:40, marginBottom:10, opacity:0.3 }}>✈</div>
              <p style={{ margin:0, fontSize:15, color:C.muted, fontStyle:'italic' }}>
                No flights in {MFULL[vm.m]}
              </p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              {monthFlights.map(e => {
                const isPastFlight = e.date < today;
                return (
                  <div key={e.id}
                    ref={el => { flightRefs.current[e.date] = el; }}
                    style={{ opacity: isPastFlight ? 0.55 : 1,
                      transition:'opacity 0.15s' }}>
                    {/* Date chip above each card */}
                    <div style={{ display:'flex', alignItems:'center', gap:8,
                      padding:'8px 0 4px' }}>
                      <div style={{ height:1, flex:1, background:C.border }} />
                      <span style={{ fontSize:11, fontWeight:700, color: isPastFlight ? C.muted : C.F,
                        textTransform:'uppercase', letterSpacing:'0.1em', flexShrink:0 }}>
                        {e.date === today ? 'Today' :
                          new Date(e.date+'T00:00:00').toLocaleDateString('en-US',
                            { weekday:'short', day:'numeric', month:'short' })}
                        {isPastFlight && ' · Past'}
                      </span>
                      <div style={{ height:1, flex:1, background:C.border }} />
                    </div>
                    {/* Holiday banners for this flight's departure date — merged SG+JP */}
                    {(() => {
                      const raw = HOLIDAYS_BY_DATE[e.date] || [];
                      const merged = [];
                      raw.forEach(h => {
                        const ex = merged.find(m => m.name === h.name);
                        if (ex) ex.countries.push(h.country);
                        else merged.push({ ...h, countries: [h.country] });
                      });
                      return merged.map((h, hi) => {
                        const isBoth = h.countries.length > 1;
                        const ac = isBoth ? C.rose : (HC[h.countries[0]]||C.rose);
                        const bg = isBoth ? '#FFF0EC' : (HC_LIGHT[h.countries[0]]||'#FEE8EA');
                        return (
                          <div key={hi} style={{ display:'flex', alignItems:'center', gap:10,
                            background: bg,
                            border:`1px solid ${ac}20`,
                            borderLeft:`3px solid ${ac}`,
                            borderRadius:BR.input, padding:'6px 12px', marginBottom:5,
                            opacity: isPastFlight ? 0.7 : 1 }}>
                            <span style={{ fontSize:16, flexShrink:0, letterSpacing:2 }}>
                              {h.countries.map(x=>({'SG':'🇸🇬','JP':'🇯🇵','FR':'🇫🇷','MY':'🇲🇾','GB':'🇬🇧','US':'🇺🇸','AU':'🇦🇺'}[x]||'')).join('')}
                            </span>
                            <div>
                              <span style={{ fontSize:12, fontWeight:700, color:ac }}>{h.name}</span>
                              <span style={{ fontSize:11, color:C.muted, marginLeft:6 }}>
                                {h.countries.length > 1 ? h.countries.map(x=>({'SG':'Singapore','JP':'Japan','FR':'France'}[x]||x)).join(' & ') : ({'SG':'Singapore','JP':'Japan','FR':'France'}[h.countries[0]]||h.countries[0])}
                                {h.name!=="Mother's Day" && h.name!=="Father's Day" && ' Public Holiday'}
                              </span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                    {/* Flight ECard */}
                    <div style={{ background:C.card, borderRadius:BR.card,
                      border:`1px solid ${isPastFlight ? C.border : '#5BB8E840'}`,
                      boxShadow: isPastFlight ? SH.subtle : `0 2px 12px ${C.F}18`,
                      overflow:'hidden', marginBottom:4 }}>
                      {/* Route hero strip */}
                      <div style={{ background: isPastFlight
                          ? C.elevated
                          : `linear-gradient(135deg,${C.F}18,${C.M}12)`,
                        padding:'10px 16px', display:'flex', alignItems:'center',
                        gap:10, borderBottom:`1px solid ${C.border}` }}>
                        <div style={{ textAlign:'center', minWidth:48 }}>
                          <div style={{ fontSize:18, fontWeight:700,
                            fontFamily:'Cormorant Garamond,serif',
                            color: isPastFlight ? C.muted : C.M }}>
                            {e.depCity || '?'}
                          </div>
                          <div style={{ fontSize:10, color:C.muted, fontWeight:600,
                            letterSpacing:'0.06em' }}>FROM</div>
                        </div>
                        <div style={{ flex:1, display:'flex', alignItems:'center', gap:4 }}>
                          <div style={{ flex:1, height:1, background: isPastFlight ? C.border : C.F+'60' }} />
                          <span style={{ fontSize:14, color: isPastFlight ? C.muted : C.F }}>✈</span>
                          <div style={{ flex:1, height:1, background: isPastFlight ? C.border : C.F+'60' }} />
                        </div>
                        <div style={{ textAlign:'center', minWidth:48 }}>
                          <div style={{ fontSize:18, fontWeight:700,
                            fontFamily:'Cormorant Garamond,serif',
                            color: isPastFlight ? C.muted : C.M }}>
                            {e.arrCity || '?'}
                          </div>
                          <div style={{ fontSize:10, color:C.muted, fontWeight:600,
                            letterSpacing:'0.06em' }}>TO</div>
                        </div>
                        {e.time && (
                          <div style={{ marginLeft:'auto', textAlign:'right', flexShrink:0 }}>
                            <div style={{ fontSize:14, fontWeight:700,
                              color: isPastFlight ? C.muted : C.text }}>{pt(e.time)}</div>
                            {e.airline && <div style={{ fontSize:11, color:C.muted }}>{e.airline}</div>}
                          </div>
                        )}
                      </div>
                      {/* ECard below route strip */}
                      <ECard e={e} onToggle={onToggle} onCancel={onCancel} onEdit={onEdit}
                        onDelete={onDelete} currentUserId={currentUserId}
                        isAdmin={isAdmin}
                        readOnly={!isAdmin && isPastFlight} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>) : (<>
          {/* Normal day view */}
          <p style={{ fontSize:12, color:C.dim, margin:'10px 0 8px',
            textTransform:'uppercase', letterSpacing:'0.12em', fontWeight:700 }}>
            {new Date(selDate+'T00:00:00').toLocaleDateString('en-US',
              {weekday:'long',month:'long',day:'numeric'})}
          </p>
          {/* Holiday banner for selected day — merged SG+JP if same name */}
          {(() => {
            const raw = HOLIDAYS_BY_DATE[selDate] || [];
            const merged = [];
            raw.forEach(h => {
              const existing = merged.find(m => m.name === h.name);
              if (existing) { existing.countries.push(h.country); }
              else { merged.push({ ...h, countries: [h.country] }); }
            });
            return merged.map((h, i) => {
              const isBoth = h.countries.length > 1;
              const accentColor = isBoth ? C.rose : (HC[h.countries[0]]||C.rose);
              const bgColor    = isBoth ? '#FFF0EC' : (HC_LIGHT[h.countries[0]]||'#FEE8EA');
              const calKey = `${h.name}|${selDate}`;
              const isExpanded = expandedCalHoliday === calKey;
              const info = HOLIDAY_INFO[h.name];
              return (
                <div key={i}
                  onClick={() => setExpandedCalHoliday(isExpanded ? null : calKey)}
                  style={{ cursor: info ? 'pointer' : 'default',
                    background: bgColor,
                    border:`1px solid ${accentColor}30`,
                    borderLeft:`3px solid ${accentColor}`,
                    borderRadius:BR.input, padding:'7px 12px', marginBottom:6,
                    boxShadow: isExpanded ? `0 3px 12px ${accentColor}15` : 'none',
                    transition:'box-shadow 0.15s' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:14, letterSpacing:2, flexShrink:0 }}>
                      {h.countries.map(x=>({'SG':'🇸🇬','JP':'🇯🇵','FR':'🇫🇷','MY':'🇲🇾','GB':'🇬🇧','US':'🇺🇸','AU':'🇦🇺'}[x]||'')).join('')}
                    </span>
                    <div style={{ flex:1 }}>
                      <span style={{ fontSize:13, fontWeight:700,
                        color:accentColor }}>{h.name}</span>
                      <span style={{ fontSize:11, color:C.muted, marginLeft:6 }}>
                        {h.countries.length > 1 ? h.countries.map(x=>({'SG':'Singapore','JP':'Japan','FR':'France'}[x]||x)).join(' & ') : ({'SG':'Singapore','JP':'Japan','FR':'France'}[h.countries[0]]||h.countries[0])}
                        {h.name!=="Mother's Day" && h.name!=="Father's Day" && ' · Public Holiday'}
                        {info && !isExpanded && <span style={{ color:C.rose }}> · Tap</span>}
                      </span>
                    </div>
                    {info && (
                      <span style={{ fontSize:13, color:C.muted, flexShrink:0,
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition:'transform 0.2s' }}>⌄</span>
                    )}
                  </div>
                  {isExpanded && info && (
                  <p style={{ margin:'8px 0 0', fontSize:13, color:C.dim,
                    lineHeight:1.7, fontStyle:'italic',
                    paddingTop:8, borderTop:`1px solid ${accentColor}20` }}>
                    {info.text}
                  </p>
                )}
              </div>
            );
          });
          })()}
          {selDayEs.length===0
            ? <div style={{ textAlign:'center', padding:'24px 18px',
                background:C.card, borderRadius:BR.card,
                border:`1px solid ${C.border}`, boxShadow:SH.subtle }}>
                <p style={{ margin:'0 0 10px', fontSize:16, fontWeight:600,
                  color:C.dim, fontStyle:'italic' }}>Nothing on this day</p>
                <button onClick={() => onAdd(selDate)}
                  style={{ background:C.rose, border:'none', color:'#fff',
                    borderRadius:BR.btn, padding:'10px 24px', fontSize:15, fontWeight:700,
                    cursor:'pointer', fontFamily:'inherit',
                    boxShadow:`0 4px 14px ${C.rose}40` }}>
                  + Schedule something
                </button>
              </div>
            : <div style={{ background:C.card, borderRadius:BR.card, padding:'0 14px',
                boxShadow:SH.card, border:`1px solid ${C.border}` }}>
                {selDayEs.map(e => <ECard key={e.id} e={e} onToggle={onToggle}
                  onCancel={onCancel} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  readOnly={!isAdmin && new Date(selDate+'T23:59:59') < new Date()} />)}
              </div>
          }
        </>)}
      </div>
    </div>
  );
}

// ─── CALENDAR TAB ────────────────────────────────────────────────
const CAL_VIEW_KEY = 'kizuna_cal_view_v1';
function CalendarTab({ entries, onToggle, onCancel, onEdit, onDelete, currentUserId, onAdd, isAdmin=false, onSyncFlights, flightSyncCount=0, isDark=false, showFlags=false, locationMap={} }) {
  const [selDate, setSelDate] = useState(fd(new Date()));
  const now = new Date();
  const [vm, setVm] = useState({ y: now.getFullYear(), m: now.getMonth() });

  const goToday = () => {
    const today = new Date();
    setSelDate(fd(today));
    setVm({ y: today.getFullYear(), m: today.getMonth() });
  };

  const isToday = selDate === fd(new Date());

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ flex:1, overflow:'hidden' }}>
        <MonthView entries={entries} selDate={selDate} setSelDate={setSelDate}
          vm={vm} setVm={setVm} goToday={goToday} isToday={isToday}
          onToggle={onToggle} onCancel={onCancel} onEdit={onEdit} onDelete={onDelete}
          currentUserId={currentUserId} onAdd={onAdd} isAdmin={isAdmin}
          onSyncFlights={onSyncFlights} flightSyncCount={flightSyncCount} isDark={isDark}
          showFlags={showFlags} locationMap={locationMap} />
      </div>
    </div>
  );
}

// ─── DAILY QUOTE SYSTEM ──────────────────────────────────────────
// Fetches one quote per calendar day from Claude API.
// Cached in localStorage — no repeat calls on same day.
// Special day detection: birthdays > anniversary > festive > standard themes.
// Privacy: birth years & anniversary year stay local — only prompt text leaves device.

const QUOTE_CACHE_KEY  = 'kizuna_daily_quote_v2'; // v2: fixed SGT local date key

// 12 quote slots per day — active 5am to 9pm, silent midnight to 5am.
// Each slot is identified by its start hour.
const SLOT_HOURS = [5, 8, 9, 11, 12, 13, 15, 17, 18, 19, 20, 21];

function getQuoteSlot(now = new Date()) {
  const h = now.getHours();
  // 12am–4:59am: serve last slot of previous cycle (no new quote)
  if (h < 5) return 21; // last slot = 9pm
  // Find the most recent slot hour that has passed
  let slot = 5;
  for (const s of SLOT_HOURS) {
    if (h >= s) slot = s;
  }
  return slot;
}

function getSlotKey(now = new Date()) {
  const h = now.getHours();
  // Use local date — toISOString() is UTC which breaks SGT timezone
  const localDate = (d) => {
    const yr  = d.getFullYear();
    const mo  = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${yr}-${mo}-${day}`;
  };
  // 12am–4:59am: use yesterday's date with last slot (no new quote overnight)
  if (h < 5) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return `${localDate(yesterday)}-21`;
  }
  return `${localDate(now)}-${getQuoteSlot(now)}`;
}
const ANNA_BIRTH_MONTH = 4;  // April
const ANNA_BIRTH_DAY   = 16;
const ANNA_BIRTH_YEAR  = 2025;
const SOPHIA_BIRTH_MONTH = 6;  // June
const SOPHIA_BIRTH_DAY   = 16;
const KOKSUM_BIRTH_MONTH = 8;  // August
const KOKSUM_BIRTH_DAY   = 27;
const ANNIV_MONTH = 7;  // July
const ANNIV_DAY   = 24;
const ANNIV_YEAR  = 2022;

// Anna's developmental milestone by age
function annaMilestone(age) {
  if (age < 1)  return 'Newborn wonder — eye contact, first smiles, recognising voices';
  if (age < 2)  return 'First steps, first words, discovering the world';
  if (age < 3)  return 'Explosion of language, curiosity, and imaginative play';
  if (age < 5)  return 'Storytelling, friendships, and growing independence';
  if (age < 10) return 'Learning to read, school life, and navigating big emotions';
  return 'Building identity, confidence, and deeper bonds with family';
}

// Fixed-date festive days
const FIXED_FESTIVE = [
  { month:12, day:24, name:'Christmas Eve' },
  { month:12, day:25, name:'Christmas Day' },
  { month:1,  day:1,  name:'New Year\'s Day' },
  { month:2,  day:3,  name:'Setsubun' },
  { month:3,  day:3,  name:'Hinamatsuri' },
  { month:7,  day:7,  name:'Tanabata' },
  { month:11, day:15, name:'Shichi-Go-San' },
];

// Hardcoded variable festive dates 2025–2035 (no external API needed)
const VARIABLE_FESTIVE = {
  cny: [
    '2025-01-29','2026-02-17','2027-02-06','2028-01-26','2029-02-13',
    '2030-02-03','2031-01-23','2032-02-11','2033-01-31','2034-02-19','2035-02-08',
  ],
  midAutumn: [
    '2025-10-06','2026-09-25','2027-10-15','2028-10-03','2029-09-22',
    '2030-10-11','2031-10-01','2032-09-19','2033-10-08','2034-09-27','2035-09-17',
  ],
  // Golden Week Apr 29 – May 5 (fixed window, no lookup needed)
  // Obon Aug 13–15 (fixed, no lookup needed)
};

// 4 standard themes — rotate by day-of-year
const STANDARD_THEMES = [
  { key:'couple',    label:'Husband & Wife',
    prompt:'the deep, quiet bond between a husband and wife — the small moments that hold a marriage together' },
  { key:'family',    label:'Family',
    prompt:'the warmth of a family — a husband, wife, and daughter growing together through everyday life' },
  { key:'mindset',   label:'Mindset',
    prompt:'the power of a positive mindset — how we frame our thoughts shapes our entire experience of life' },
  { key:'calm',      label:'Inner Calm',
    prompt:'inner calm, deep rest, and the stillness that heals and restores from within' },
  { key:'gratitude', label:'Gratitude',
    prompt:'gratitude — the quiet art of noticing beauty in ordinary moments and finding abundance in what we already have' },
  { key:'growth',    label:'Growth',
    prompt:'personal growth — the courage to keep becoming, to learn from setbacks, and to trust the process of change' },
  { key:'presence',  label:'Being Present',
    prompt:'the gift of being fully present — how attention and awareness deepen every moment of life' },
  { key:'love',      label:'Love',
    prompt:'love in its everyday form — not grand gestures, but quiet devotion, patience, and choosing each other daily' },
  { key:'morning',   label:'New Day',
    prompt:'the freshness of a new day — each morning as an invitation to begin again with hope and intention' },
  { key:'strength',  label:'Inner Strength',
    prompt:'resilience and inner strength — the quiet power that carries us through difficulty and uncertainty' },
  { key:'wonder',    label:'Wonder',
    prompt:'curiosity and wonder — seeing the world through fresh eyes and finding magic in the everyday' },
  { key:'together',  label:'Connection',
    prompt:'the beauty of human connection — how sharing life with those we love makes everything richer' },
  { key:'trust',     label:'Trust',
    prompt:'trust — in ourselves, in each other, and in the unfolding of life even when we cannot see the path ahead' },
  { key:'joy',       label:'Simple Joy',
    prompt:'simple joys — laughter, warmth, small pleasures, and the happiness that needs no reason' },
  { key:'roots',     label:'Home & Belonging',
    prompt:'the feeling of home and belonging — where we are known, accepted, and loved exactly as we are' },
  { key:'dreams',    label:'Dreams & Hope',
    prompt:'holding onto dreams and the quiet courage of hope — believing in what is possible even before it arrives' },
];

// Mother's Day (2nd Sunday May) and Father's Day (3rd Sunday June) — 2026–2035
const MOTHERS_DAY_DATES = ['2026-05-10','2027-05-09','2028-05-14','2029-05-13','2030-05-12','2031-05-11','2032-05-09','2033-05-08','2034-05-14','2035-05-13'];
const FATHERS_DAY_DATES = ['2026-06-21','2027-06-20','2028-06-18','2029-06-17','2030-06-16','2031-06-15','2032-06-20','2033-06-19','2034-06-18','2035-06-17'];

function detectSpecialDay(now = new Date()) {
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const yr = now.getFullYear();
  const ds = `${yr}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

  // ── Birthdays ────────────────────────────────────────────────
  const isAnnaBirthday    = m === ANNA_BIRTH_MONTH    && d === ANNA_BIRTH_DAY;
  const isSophiaBirthday  = m === SOPHIA_BIRTH_MONTH  && d === SOPHIA_BIRTH_DAY;
  const isKoksumBirthday  = m === KOKSUM_BIRTH_MONTH  && d === KOKSUM_BIRTH_DAY;

  // ── Anniversary ──────────────────────────────────────────────
  const isAnniversary     = m === ANNIV_MONTH && d === ANNIV_DAY;
  const anniversaryYears  = yr - ANNIV_YEAR;

  // ── Mother's Day & Father's Day ──────────────────────────────
  const isMothersDay = MOTHERS_DAY_DATES.includes(ds);
  const isFathersDay = FATHERS_DAY_DATES.includes(ds);

  // ── Fixed festive ────────────────────────────────────────────
  const fixedFestive = FIXED_FESTIVE.find(f => f.month === m && f.day === d) || null;

  // ── Variable festive ─────────────────────────────────────────
  const isCNY        = VARIABLE_FESTIVE.cny.includes(ds);
  const isMidAutumn  = VARIABLE_FESTIVE.midAutumn.includes(ds);
  const isGoldenWeek = (m === 4 && d >= 29) || (m === 5 && d <= 5);
  const isObon       = m === 8 && d >= 13 && d <= 15;

  let festiveName = null;
  if (isMothersDay)   festiveName = "Mother's Day";
  else if (isFathersDay) festiveName = "Father's Day";
  else if (isCNY)     festiveName = 'Chinese New Year';
  else if (isMidAutumn) festiveName = 'Mid-Autumn Festival';
  else if (isGoldenWeek) festiveName = 'Golden Week';
  else if (isObon)    festiveName = 'Obon';
  else if (fixedFestive) festiveName = fixedFestive.name;

  return {
    isAnnaBirthday, isSophiaBirthday, isKoksumBirthday,
    isAnniversary, anniversaryYears,
    isMothersDay, isFathersDay,
    festiveName,
    annaAge: yr - ANNA_BIRTH_YEAR - (
      new Date(yr, ANNA_BIRTH_MONTH-1, ANNA_BIRTH_DAY) > now ? 1 : 0
    ),
  };
}

function buildQuoteLabel(day) {
  const { isAnnaBirthday, isSophiaBirthday, isKoksumBirthday,
          isAnniversary, festiveName } = day;

  const parts = [];
  if (isAnnaBirthday)   parts.push("Anna's Birthday");
  else if (isSophiaBirthday) parts.push("Sophia's Birthday");
  else if (isKoksumBirthday) parts.push("Koksum's Birthday");
  if (isAnniversary)    parts.push('Wedding Anniversary');
  if (festiveName)      parts.push(festiveName);

  const suffix = " · Today's Quote";
  return parts.length > 0 ? parts.join(' & ') + suffix : null;
}

// Famous people whose quotes fit each special day type
const FAMOUS_BY_OCCASION = {
  festive:     ['Rumi','Maya Angelou','Thich Nhat Hanh','Pablo Neruda','Rabindranath Tagore','Khalil Gibran'],
  golden_week: ['Matsuo Bashō','Yoko Ono','Haruki Murakami','Daisetz Suzuki','Confucius','Laozi'],
  cny:         ['Confucius','Laozi','Sun Tzu','Zhuangzi','Mencius','Rumi'],
  mid_autumn:  ['Matsuo Bashō','Du Fu','Li Bai','Khalil Gibran','Rumi','Pablo Neruda'],
  obon:        ['Matsuo Bashō','Daisetz Suzuki','Thich Nhat Hanh','Ryōkan','Zhuangzi'],
  mothers_day: ['Maya Angelou','Toni Morrison','Virginia Woolf','Anne Lamott','Simone de Beauvoir','Rumi'],
  fathers_day: ['Nelson Mandela','Barack Obama','Mark Twain','Fyodor Dostoevsky','Khalil Gibran','Confucius'],
  birthday:    ['Dr Seuss','Ralph Waldo Emerson','Maya Angelou','Rumi','Albert Einstein','Audrey Hepburn'],
  anniversary: ['Rumi','Pablo Neruda','Khalil Gibran','Viktor Frankl','Antoine de Saint-Exupéry','CS Lewis'],
};

function pickFamousPerson(occasionKey, slotHour) {
  const list = FAMOUS_BY_OCCASION[occasionKey] || FAMOUS_BY_OCCASION.festive;
  return list[slotHour % list.length];
}

function buildQuotePrompt(day, themeIndex, slotHour = 0) {
  const { isAnnaBirthday, isSophiaBirthday, isKoksumBirthday,
          isAnniversary, anniversaryYears, festiveName, annaAge } = day;
  const milestone = annaMilestone(annaAge);
  const theme = STANDARD_THEMES[themeIndex % STANDARD_THEMES.length];

  // Combined scenarios (priority: birthday > anniversary > festive)
  const hasBirthday = isAnnaBirthday || isSophiaBirthday || isKoksumBirthday;
  const bdName = isAnnaBirthday ? 'Anna' : isSophiaBirthday ? 'Sophia' : 'Koksum';

  // Alternation: odd slot hours → original-style special day quote
  //              even slot hours → quote in style of a famous person for that occasion
  // (Birthdays always stay personal — no alternation for intimacy)
  const isAlt = (slotHour % 2 === 0);

  if (hasBirthday && isAnniversary && festiveName) {
    const bdExtra = isAnnaBirthday ? ` She is at the developmental stage of: ${milestone}.` : '';
    return `Write a quote where today is ${festiveName}, ${bdName}'s ${annaAge > 0 && isAnnaBirthday ? annaAge+'th ' : ''}birthday, and the couple's ${anniversaryYears}th wedding anniversary.${bdExtra} Lead with the birthday, honour the anniversary, and let the festive occasion set a joyful atmosphere.`;
  }
  if (hasBirthday && festiveName) {
    const bdExtra = isAnnaBirthday ? ` She is at the developmental stage of: ${milestone}.` : '';
    const age = isAnnaBirthday ? `${annaAge}th ` : '';
    return `Write a quote for a family celebrating ${festiveName} and also their ${bdName === 'Anna' ? 'daughter' : bdName === 'Sophia' ? 'wife' : 'husband'} ${bdName}'s ${age}birthday on the same day.${bdExtra} Lead with the birthday as the heart of the message, and let the festive occasion enrich the backdrop.`;
  }
  if (hasBirthday && isAnniversary) {
    const bdExtra = isAnnaBirthday ? ` She is at the developmental stage of: ${milestone}.` : '';
    const age = isAnnaBirthday ? `${annaAge}th ` : '';
    return `Write a quote for a family where today is both ${bdName}'s ${age}birthday and the couple's ${anniversaryYears}th wedding anniversary.${bdExtra} Lead with the birthday, and weave in the anniversary as a beautiful shared milestone.`;
  }
  if (isAnniversary && festiveName) {
    if (isAlt) {
      const person = pickFamousPerson('anniversary', slotHour);
      return `Write a quote about enduring love and marriage in the voice and style of ${person}, inspired by their known works and philosophy. Set against the atmosphere of ${festiveName}. End with — ${person}.`;
    }
    return `Write a quote for a couple celebrating their ${anniversaryYears}th wedding anniversary on ${festiveName}. Let the festive spirit enrich the anniversary message — intimate, warm, and celebratory.`;
  }

  // Single special days
  if (isAnnaBirthday) {
    return `Write a birthday quote for a daughter named Anna who is turning ${annaAge} today. She is at the developmental stage of: ${milestone}. The quote should speak to her parents — warm, tender, and full of wonder at watching her grow.`;
  }
  if (isSophiaBirthday) {
    return `Write a warm birthday quote celebrating a wife named Sophia. The tone should feel like a loving tribute from her family — joyful, heartfelt, and personal.`;
  }
  if (isKoksumBirthday) {
    return `Write a warm birthday quote celebrating a husband and father named Koksum. The tone should feel like a loving tribute from his wife and daughter — proud, warm, and celebratory.`;
  }
  if (isAnniversary) {
    if (isAlt) {
      const person = pickFamousPerson('anniversary', slotHour);
      return `Write a quote about enduring love and long marriage in the voice and style of ${person}, drawing from their philosophy and known works. End with — ${person}.`;
    }
    return `Write an anniversary quote for a couple celebrating ${anniversaryYears} years of marriage today. The tone should feel intimate and reflective — honouring the depth of a relationship built over ${anniversaryYears} years.`;
  }
  if (festiveName) {
    // Pick occasion key for famous person pool
    const occasionKey = festiveName === 'Golden Week' ? 'golden_week'
      : festiveName === 'Chinese New Year' ? 'cny'
      : festiveName === 'Mid-Autumn Festival' ? 'mid_autumn'
      : festiveName === 'Obon' ? 'obon'
      : festiveName === "Mother's Day" ? 'mothers_day'
      : festiveName === "Father's Day" ? 'fathers_day'
      : 'festive';
    if (isAlt) {
      const person = pickFamousPerson(occasionKey, slotHour);
      return `Write a quote about the spirit and meaning of ${festiveName} in the voice and style of ${person}, inspired by their known philosophy, poetry, or writings. Keep it warm and universal. End with — ${person}.`;
    }
    return `Write a warm family quote for ${festiveName}. The tone should be joyful, grounding, and focused on the meaning of the day for a close-knit family.`;
  }

  // Standard theme
  return `Write a quote on the theme: "${theme.prompt}".`;
}

async function fetchDailyQuote(supabaseClient) {
  const slotKey = getSlotKey(); // e.g. '2026-05-03-morning'

  // Serve cache if same slot
  try {
    const cached = JSON.parse(localStorage.getItem(QUOTE_CACHE_KEY) || 'null');
    if (cached?.slot === slotKey && cached?.quote) return cached;
  } catch { /* ignore */ }

  // Pick theme: combine day-of-year × slot hour so each slot gets a unique theme
  // and the same slot never repeats the same theme on consecutive days
  const now = new Date();
  const day = detectSpecialDay(now);
  // Use local midnight to avoid UTC offset shifting the day boundary
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yearStart     = new Date(now.getFullYear(), 0, 0);
  const dayOfYear     = Math.floor((localMidnight - yearStart) / 86400000);
  const slotHour  = getQuoteSlot(now);
  const themeIndex = (dayOfYear * 7 + slotHour * 3) % STANDARD_THEMES.length;
  const prompt   = buildQuotePrompt(day, themeIndex, slotHour);
  const label    = buildQuoteLabel(day) ||
    '* · Today\'s Reflection';
  const isSpecial = day.isAnnaBirthday || day.isSophiaBirthday || day.isKoksumBirthday ||
                    day.isAnniversary  || !!day.festiveName;

  try {
    // Call via Supabase Edge Function — API key stays server-side in Vault
    const { data, error } = await supabaseClient.functions.invoke('kizuna-quote', {
      body: { prompt, label, isSpecial },
    });

    if (error || !data?.quote) {
      console.error('kizuna-quote error:', error?.message || 'no quote in response');
      return null;
    }

    const result = { slot: slotKey, quote: data.quote, label, isSpecial };
    localStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(result));
    return result;
  } catch (err) {
    console.error('fetchDailyQuote failed:', err);
    return null;
  }
}

// ─── FULL-SCREEN SAKURA PETAL CSS ───────────────────────────────
const SPLASH_PETAL_CSS = `
@keyframes spin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes splashPetal1 {
  0%   { transform: translate(0, -20px) rotate(0deg);    opacity:0; }
  8%   { opacity:0.8; }
  100% { transform: translate(35px, 110vh) rotate(480deg); opacity:0; }
}
@keyframes splashPetal2 {
  0%   { transform: translate(0, -10px) rotate(25deg);   opacity:0; }
  12%  { opacity:0.6; }
  100% { transform: translate(-45px, 110vh) rotate(-540deg); opacity:0; }
}
@keyframes splashPetal3 {
  0%   { transform: translate(0, -15px) rotate(-15deg);  opacity:0; }
  10%  { opacity:0.7; }
  100% { transform: translate(20px, 110vh) rotate(600deg); opacity:0; }
}
@keyframes splashPetal4 {
  0%   { transform: translate(0, -5px)  rotate(40deg);   opacity:0; }
  15%  { opacity:0.5; }
  100% { transform: translate(-30px, 110vh) rotate(-420deg); opacity:0; }
}
@keyframes splashPetal5 {
  0%   { transform: translate(0, -25px) rotate(-30deg);  opacity:0; }
  9%   { opacity:0.65; }
  100% { transform: translate(50px, 110vh) rotate(560deg); opacity:0; }
}
@keyframes splashPetal6 {
  0%   { transform: translate(0, -8px)  rotate(15deg);   opacity:0; }
  11%  { opacity:0.55; }
  100% { transform: translate(-25px, 110vh) rotate(-380deg); opacity:0; }
}
@keyframes quoteCardIn {
  0%   { opacity:0; transform:translateY(32px); }
  100% { opacity:1; transform:translateY(0); }
}
@keyframes shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
@keyframes quoteSwipeDown {
  0%   { transform:translateY(0); opacity:1; }
  100% { transform:translateY(110vh); opacity:0; }
}
`;

const SPLASH_PETALS = [
  { left:'8%',  anim:'splashPetal1', dur:'5.2s', delay:'0.0s', size:9,  color:'#EAA898' },
  { left:'20%', anim:'splashPetal3', dur:'6.8s', delay:'0.6s', size:7,  color:'#F0C0B4' },
  { left:'35%', anim:'splashPetal2', dur:'5.8s', delay:'1.2s', size:10, color:'#EAB8A8' },
  { left:'52%', anim:'splashPetal5', dur:'7.1s', delay:'0.3s', size:8,  color:'#E8A090' },
  { left:'66%', anim:'splashPetal4', dur:'6.2s', delay:'1.8s', size:6,  color:'#F5CCBC' },
  { left:'78%', anim:'splashPetal1', dur:'5.5s', delay:'0.9s', size:9,  color:'#EAA898' },
  { left:'90%', anim:'splashPetal6', dur:'6.5s', delay:'2.1s', size:7,  color:'#F0C0B4' },
  { left:'14%', anim:'splashPetal2', dur:'7.4s', delay:'3.0s', size:8,  color:'#EAB8A8' },
  { left:'44%', anim:'splashPetal3', dur:'5.9s', delay:'1.5s', size:6,  color:'#E8A090' },
  { left:'62%', anim:'splashPetal5', dur:'6.7s', delay:'2.7s', size:10, color:'#F5CCBC' },
  { left:'28%', anim:'splashPetal6', dur:'8.0s', delay:'0.4s', size:7,  color:'#EAA898' },
  { left:'85%', anim:'splashPetal4', dur:'5.6s', delay:'3.5s', size:8,  color:'#F0C0B4' },
];

// ── Autumn momiji splash — gravity + wind gust physics ────────────────────
const SPLASH_MOMIJI_CSS = `
@keyframes momijiSplash1 {
  0%   { transform:translate(0,-12px) rotate(0deg);    opacity:0; }
  6%   { opacity:0.88; }
  25%  { transform:translate(18px,22vh) rotate(55deg); }
  50%  { transform:translate(8px,48vh) rotate(95deg);  }
  75%  { transform:translate(28px,72vh) rotate(155deg); opacity:0.7; }
  100% { transform:translate(20px,108vh) rotate(200deg); opacity:0; }
}
@keyframes momijiSplash2 {
  0%   { transform:translate(0,-8px) rotate(-20deg);   opacity:0; }
  8%   { opacity:0.82; }
  20%  { transform:translate(-22px,18vh) rotate(-60deg); }
  45%  { transform:translate(-10px,44vh) rotate(-100deg); }
  70%  { transform:translate(-30px,68vh) rotate(-150deg); opacity:0.65; }
  100% { transform:translate(-18px,106vh) rotate(-210deg); opacity:0; }
}
@keyframes momijiSplash3 {
  0%   { transform:translate(0,-14px) rotate(12deg);   opacity:0; }
  7%   { opacity:0.9; }
  30%  { transform:translate(30px,26vh) rotate(70deg); }
  55%  { transform:translate(12px,52vh) rotate(105deg); }
  80%  { transform:translate(24px,75vh) rotate(160deg); opacity:0.68; }
  100% { transform:translate(16px,110vh) rotate(215deg); opacity:0; }
}
@keyframes momijiSplash4 {
  0%   { transform:translate(0,-6px) rotate(28deg);    opacity:0; }
  9%   { opacity:0.78; }
  22%  { transform:translate(-30px,20vh) rotate(-45deg); }
  48%  { transform:translate(-15px,45vh) rotate(-90deg); }
  72%  { transform:translate(-35px,70vh) rotate(-145deg); opacity:0.6; }
  100% { transform:translate(-22px,107vh) rotate(-200deg); opacity:0; }
}
@keyframes momijiSplash5 {
  0%   { transform:translate(0,-16px) rotate(-8deg);   opacity:0; }
  6%   { opacity:0.86; }
  28%  { transform:translate(25px,24vh) rotate(60deg); }
  52%  { transform:translate(35px,50vh) rotate(110deg); }
  78%  { transform:translate(20px,73vh) rotate(170deg); opacity:0.65; }
  100% { transform:translate(28px,112vh) rotate(225deg); opacity:0; }
}
@keyframes momijiSplash6 {
  0%   { transform:translate(0,-10px) rotate(18deg);   opacity:0; }
  10%  { opacity:0.75; }
  25%  { transform:translate(-18px,22vh) rotate(-40deg); }
  50%  { transform:translate(-28px,46vh) rotate(-95deg); }
  76%  { transform:translate(-12px,70vh) rotate(-148deg); opacity:0.58; }
  100% { transform:translate(-20px,108vh) rotate(-195deg); opacity:0; }
}
`;

// Realistic maple leaf paths
const SPLASH_LEAF_7 = "M0,1 C-1,0 -3,0 -5,1 C-8,2 -11,0 -12,-3 C-11,-6 -9,-6 -8,-4 C-9,-7 -9,-11 -7,-14 C-5,-11 -4,-10 -4,-7 C-5,-10 -4,-15 -2,-17 C-1,-13 -0.5,-11 0,-9 C0.5,-11 1,-13 2,-17 C4,-15 5,-10 4,-7 C4,-10 5,-11 7,-14 C9,-11 9,-7 8,-4 C9,-6 11,-6 12,-3 C11,0 8,2 5,1 C3,0 1,0 0,1 Z";
const SPLASH_LEAF_5 = "M0,2 C-2,1 -5,1 -8,-1 C-11,-3 -12,-7 -10,-10 C-8,-8 -7,-8 -7,-6 C-8,-9 -7,-13 -5,-15 C-3,-12 -2,-10 -2,-8 C-2,-11 -1,-14 0,-15 C1,-14 2,-11 2,-8 C2,-10 3,-12 5,-15 C7,-13 8,-9 7,-6 C7,-8 8,-8 10,-10 C12,-7 11,-3 8,-1 C5,1 2,1 0,2 Z";

// 11 leaves: greens → yellows → oranges → reds
const SPLASH_MOMIJI = [
  { left:'6%',  anim:'momijiSplash1', dur:'5.4s', delay:'0.0s', path:SPLASH_LEAF_7, fill:'#4E8C2A', vein:'#2E5A10', size:14 },
  { left:'18%', anim:'momijiSplash3', dur:'7.0s', delay:'0.7s', path:SPLASH_LEAF_5, fill:'#82B030', vein:'#4E6C18', size:11 },
  { left:'30%', anim:'momijiSplash2', dur:'6.0s', delay:'1.4s', path:SPLASH_LEAF_7, fill:'#C8B820', vein:'#806E10', size:13 },
  { left:'44%', anim:'momijiSplash5', dur:'7.3s', delay:'0.4s', path:SPLASH_LEAF_5, fill:'#E09020', vein:'#905810', size:12 },
  { left:'56%', anim:'momijiSplash4', dur:'6.4s', delay:'1.9s', path:SPLASH_LEAF_7, fill:'#D46420', vein:'#8A3A08', size:14 },
  { left:'70%', anim:'momijiSplash1', dur:'5.7s', delay:'1.0s', path:SPLASH_LEAF_5, fill:'#C84218', vein:'#802208', size:11 },
  { left:'82%', anim:'momijiSplash6', dur:'6.8s', delay:'2.2s', path:SPLASH_LEAF_7, fill:'#E03028', vein:'#A01818', size:13 },
  { left:'92%', anim:'momijiSplash3', dur:'5.9s', delay:'0.5s', path:SPLASH_LEAF_5, fill:'#CC2828', vein:'#880E0E', size:10 },
  { left:'12%', anim:'momijiSplash4', dur:'7.6s', delay:'3.1s', path:SPLASH_LEAF_7, fill:'#B87020', vein:'#703A08', size:12 },
  { left:'38%', anim:'momijiSplash2', dur:'6.2s', delay:'2.5s', path:SPLASH_LEAF_5, fill:'#A8C420', vein:'#607010', size:11 },
  { left:'60%', anim:'momijiSplash6', dur:'8.2s', delay:'0.2s', path:SPLASH_LEAF_7, fill:'#D85020', vein:'#902808', size:13 },
];

// ─── MOMIJI OVERLAY — botanical canvas, 3D tumble, wind physics ──────────────
const MOMIJI_INTENSITY_MAP = { light: 35, medium: 60, heavy: 90 };

function _mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function _drawMomijiLeaf(ctx, lobes, radius, hue, sat, lit, isGreenToRed) {
  const cx = radius + 4, cy = radius * 1.1 + 4;
  const W = (radius + 4) * 2, H = (radius * 1.1 + 4) * 2;
  ctx.clearRect(0, 0, W, H);
  let grad;
  if (isGreenToRed) {
    grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, 'hsl(10,75%,40%)');
    grad.addColorStop(0.5, 'hsl(38,80%,52%)');
    grad.addColorStop(1, 'hsl(90,60%,38%)');
  } else {
    grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `hsl(${hue},${sat}%,${lit - 10}%)`);
    grad.addColorStop(0.6, `hsl(${hue},${sat}%,${lit}%)`);
    grad.addColorStop(1, `hsl(${Math.min(hue + 15, 55)},${sat - 5}%,${lit + 12}%)`);
  }
  ctx.beginPath();
  const totalSpan = lobes === 7 ? 200 : 170;
  const lobeSpacing = totalSpan / (lobes - 1);
  const startAngle = -90 - totalSpan / 2;
  const sinusR = radius * (lobes === 7 ? 0.38 : 0.42);
  const petioleX = cx, petioleY = cy + radius * 0.45;
  ctx.moveTo(petioleX, petioleY);
  for (let i = 0; i < lobes; i++) {
    const ang = (startAngle + i * lobeSpacing) * (Math.PI / 180);
    const tipX = cx + Math.cos(ang) * radius;
    const tipY = cy + Math.sin(ang) * radius;
    const sinusAng = ang - (lobeSpacing * 0.5 * Math.PI / 180);
    const sinusX = cx + Math.cos(sinusAng) * sinusR;
    const sinusY = cy + Math.sin(sinusAng) * sinusR;
    const leftAng = ang - 0.22, rightAng = ang + 0.22;
    const cp1x = cx + Math.cos(leftAng) * radius * 0.72;
    const cp1y = cy + Math.sin(leftAng) * radius * 0.72;
    const cp2x = cx + Math.cos(rightAng) * radius * 0.72;
    const cp2y = cy + Math.sin(rightAng) * radius * 0.72;
    if (i === 0) {
      ctx.bezierCurveTo(
        petioleX + Math.cos(sinusAng) * sinusR * 0.6,
        petioleY + Math.sin(sinusAng) * sinusR * 0.6,
        cp1x, cp1y, tipX, tipY);
    } else {
      ctx.bezierCurveTo(cp2x, cp2y, sinusX, sinusY, sinusX, sinusY);
      ctx.bezierCurveTo(
        sinusX + (cp1x - sinusX) * 0.8,
        sinusY + (cp1y - sinusY) * 0.8,
        cp1x, cp1y, tipX, tipY);
    }
  }
  const lastAng = (startAngle + (lobes - 1) * lobeSpacing + lobeSpacing * 0.5) * (Math.PI / 180);
  const lastSinusX = cx + Math.cos(lastAng) * sinusR;
  const lastSinusY = cy + Math.sin(lastAng) * sinusR;
  ctx.bezierCurveTo(
    cx + Math.cos((startAngle + (lobes - 1) * lobeSpacing + 0.22) * Math.PI / 180) * radius * 0.72,
    cy + Math.sin((startAngle + (lobes - 1) * lobeSpacing + 0.22) * Math.PI / 180) * radius * 0.72,
    lastSinusX, lastSinusY, lastSinusX, lastSinusY);
  ctx.bezierCurveTo(
    lastSinusX * 0.8 + petioleX * 0.2,
    lastSinusY * 0.8 + petioleY * 0.2,
    petioleX, petioleY - 2, petioleX, petioleY);
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = `hsla(${hue - 5},${sat}%,${lit - 20}%,0.5)`;
  ctx.lineWidth = 0.6; ctx.stroke();
  const veinColor = 'rgba(255,248,220,0.55)';
  ctx.lineWidth = 0.5; ctx.strokeStyle = veinColor;
  for (let i = 0; i < lobes; i++) {
    const ang = (startAngle + i * lobeSpacing) * (Math.PI / 180);
    const tipX = cx + Math.cos(ang) * radius * 0.88;
    const tipY = cy + Math.sin(ang) * radius * 0.88;
    const midX = cx + Math.cos(ang) * radius * 0.48;
    const midY = cy + Math.sin(ang) * radius * 0.48;
    ctx.beginPath();
    ctx.moveTo(petioleX, petioleY - 2);
    ctx.quadraticCurveTo(midX, midY, tipX, tipY); ctx.stroke();
    if (radius > 38) {
      ctx.lineWidth = 0.35; ctx.strokeStyle = 'rgba(255,248,220,0.35)';
      const bx = petioleX + (tipX - petioleX) * 0.55;
      const by = petioleY + (tipY - petioleY) * 0.55;
      const side = (i % 2 === 0 ? 1 : -1) * 8;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + side, by - 6); ctx.stroke();
      ctx.lineWidth = 0.5; ctx.strokeStyle = veinColor;
    }
  }
  ctx.beginPath(); ctx.moveTo(petioleX, petioleY); ctx.lineTo(petioleX, petioleY + radius * 0.28);
  ctx.lineWidth = 0.8; ctx.strokeStyle = `hsla(${hue},40%,${lit - 15}%,0.7)`; ctx.stroke();
}

function _buildMomijiTemplates() {
  const templates = [];
  const rand = _mulberry32(0xdeadbeef);
  for (let i = 0; i < 14; i++) {
    const lobes = i % 3 === 0 ? 7 : 5;
    const size  = 28 + Math.floor(rand() * 44);
    const radius = size / 2;
    const isGreen = rand() < 0.15;
    const palette = [
      [rand() * 16, 75 + rand() * 15, 38 + rand() * 12],
      [20 + rand() * 15, 70 + rand() * 20, 42 + rand() * 15],
      [38 + rand() * 12, 65 + rand() * 20, 48 + rand() * 17],
      [5  + rand() * 8,  72 + rand() * 18, 35 + rand() * 14],
    ];
    const [hue, sat, lit] = palette[i % 4];
    const W = (radius + 4) * 2, H = (radius * 1.1 + 4) * 2;
    const offscreen = document.createElement('canvas');
    offscreen.width = Math.ceil(W); offscreen.height = Math.ceil(H);
    _drawMomijiLeaf(offscreen.getContext('2d'), lobes, radius, hue, sat, lit, isGreen);
    templates.push({ canvas:offscreen, size, W, H, cx:radius+4, cy:radius*1.1+4 });
  }
  return templates;
}

function _spawnMomijiLeaf(W, H, templates, fromSide) {
  const tmpl = templates[Math.floor(Math.random() * templates.length)];
  const r = Math.random();
  let layer, alpha, speedMult;
  if (r < 0.30)      { layer='fg'; alpha=0.88+Math.random()*0.12; speedMult=1.0; }
  else if (r < 0.70) { layer='mg'; alpha=0.65+Math.random()*0.17; speedMult=0.65; }
  else               { layer='bg'; alpha=0.30+Math.random()*0.20; speedMult=0.35; }
  let x, y, vx;
  if (fromSide) {
    const fromLeft = Math.random() < 0.5;
    x = fromLeft ? -tmpl.W : W + tmpl.W;
    y = Math.random() * H * 0.7;
    vx = fromLeft ? (0.4 + Math.random() * 1.2) : -(0.4 + Math.random() * 1.2);
  } else {
    x = -tmpl.W + Math.random() * (W + tmpl.W * 2);
    y = -(tmpl.H + Math.random() * 60);
    vx = (Math.random() - 0.5) * 0.8;
  }
  return {
    tmpl, x, y, vx,
    vy:        0.1 + Math.random() * 0.4 * speedMult,
    gravity:   (0.012 + Math.random() * 0.033) * speedMult,
    rotation:  Math.random() * Math.PI * 2,
    rotSpeed:  (Math.random() - 0.5) * 0.035,
    tiltAngle: Math.random() * Math.PI * 2,
    tiltSpeed: (0.012 + Math.random() * 0.030) * (Math.random() < 0.5 ? 1 : -1),
    swayPhase: Math.random() * Math.PI * 2,
    swayFreq:  0.018 + Math.random() * 0.022,
    swayAmp:   0.012 + Math.random() * 0.020,
    speedMult, layer, alpha,
  };
}

function MomijiOverlay({ isVisible = true, intensity = 'medium' }) {
  const fgRef = useRef(null);
  const bgRef = useRef(null);
  useEffect(() => {
    if (!isVisible) return;
    const fgCanvas = fgRef.current, bgCanvas = bgRef.current;
    if (!fgCanvas || !bgCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let VW = window.innerWidth, VH = window.innerHeight;
    const setup = (c) => {
      c.width  = Math.round(VW * dpr); c.height = Math.round(VH * dpr);
      c.style.width = VW + 'px'; c.style.height = VH + 'px';
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return ctx;
    };
    let fgCtx = setup(fgCanvas), bgCtx = setup(bgCanvas);
    const onResize = () => {
      VW = window.innerWidth; VH = window.innerHeight;
      fgCtx = setup(fgCanvas); bgCtx = setup(bgCanvas);
    };
    window.addEventListener('resize', onResize);
    const templates = _buildMomijiTemplates();
    const count  = MOMIJI_INTENSITY_MAP[intensity] ?? 60;
    const leaves = Array.from({ length: count }, () => {
      const l = _spawnMomijiLeaf(VW, VH, templates, false);
      l.y = -l.tmpl.H + Math.random() * (VH + l.tmpl.H); return l;
    });
    let t = 0, windGust = 0, gustTimer = 3000 + Math.random() * 3000, lastNow = performance.now(), animId;
    const loop = (now) => {
      const dt = Math.min(now - lastNow, 50); lastNow = now; t += dt;
      const windX = 0.6 * Math.sin(t * 0.0003) + windGust;
      gustTimer -= dt;
      if (gustTimer <= 0) {
        windGust = (Math.random() - 0.5) * 3.0;
        gustTimer = 3000 + Math.random() * 3000;
      }
      windGust *= 0.992;
      fgCtx.clearRect(0, 0, VW, VH); bgCtx.clearRect(0, 0, VW, VH);
      for (let i = 0; i < leaves.length; i++) {
        const l = leaves[i];
        l.vy += l.gravity; l.swayPhase += l.swayFreq;
        l.vx += Math.sin(l.swayPhase) * l.swayAmp + windX * l.speedMult * 0.018;
        l.vx *= 0.98; l.vy *= 0.998;
        l.x += l.vx; l.y += l.vy;
        l.rotation += l.rotSpeed; l.tiltAngle += l.tiltSpeed;
        if (l.y > VH + l.tmpl.H + 20 || l.x < -VW * 0.4 || l.x > VW * 1.4) {
          leaves[i] = _spawnMomijiLeaf(VW, VH, templates, Math.abs(windX) > 1.2 && Math.random() < 0.25);
          continue;
        }
        const ctx = l.layer === 'bg' ? bgCtx : fgCtx;
        ctx.save(); ctx.globalAlpha = l.alpha;
        ctx.translate(l.x, l.y); ctx.rotate(l.rotation);
        ctx.scale(Math.cos(l.tiltAngle), 1);
        ctx.drawImage(l.tmpl.canvas, -l.tmpl.cx, -l.tmpl.cy);
        ctx.restore();
      }
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize); };
  }, [isVisible, intensity]);
  if (!isVisible) return null;
  const s = { position:'fixed', top:0, left:0, width:'100vw', height:'100vh', zIndex:9999, pointerEvents:'none' };
  return (
    <>
      <canvas ref={bgRef} style={{ ...s, filter:'blur(1.5px)', opacity:0.85 }} />
      <canvas ref={fgRef} style={s} />
    </>
  );
}

// ─── HOTARU OVERLAY — elegant colorful fireflies, no trail ──────────────────
function HotaruOverlay({ isVisible=true, count=22, zIndex=9999 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!isVisible) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    let VW = window.innerWidth, VH = window.innerHeight;
    let ctx;
    const setup = () => {
      canvas.width  = Math.round(VW*dpr);
      canvas.height = Math.round(VH*dpr);
      canvas.style.width  = VW+'px';
      canvas.style.height = VH+'px';
      ctx = canvas.getContext('2d');
      ctx.setTransform(dpr,0,0,dpr,0,0);
    };
    setup();

    // Colour palette — warm yellows, soft greens, teals, pale golds
    const PALETTES = [
      { h:[68,95,62],  c:[60,100,96]  },  // classic warm yellow-green
      { h:[52,90,58],  c:[48,100,94]  },  // golden amber
      { h:[80,80,55],  c:[75,90,90]   },  // soft lime
      { h:[160,70,45], c:[155,85,82]  },  // aqua teal
      { h:[44,95,52],  c:[40,100,90]  },  // deep amber-gold
      { h:[100,65,50], c:[95,80,85]   },  // yellow-green
      { h:[190,55,48], c:[185,75,80]  },  // ice blue-green
    ];

    const mkFly = () => {
      const pal   = PALETTES[Math.floor(Math.random() * PALETTES.length)];
      const core  = 3 + Math.random() * 4;        // 3–7px — bigger, visible
      const spd   = 0.15 + Math.random() * 0.55;  // slow & elegant
      const ang   = Math.random() * Math.PI * 2;
      const isPaused = Math.random() < 0.3;
      return {
        x: VW*0.08 + Math.random()*VW*0.84,
        y: VH*0.08 + Math.random()*VH*0.84,
        vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd,
        speed: spd,
        targetAngle: ang, turnT: 0,
        paused: isPaused,
        pauseTimer: isPaused ? 800+Math.random()*2400 : 0,
        moveTimer:  !isPaused ? 1200+Math.random()*3000 : 0,
        hoverPhase: Math.random()*Math.PI*2,
        hoverAmp:   0.12 + Math.random()*0.22,
        phase:      Math.random()*Math.PI*2,
        blinkSpd:   0.008 + Math.random()*0.018,
        pal, core,
        glowR: core * (8 + Math.random()*5),
        alpha: 0,
      };
    };

    const flies = Array.from({length: count}, mkFly);

    const onResize = () => { VW=window.innerWidth; VH=window.innerHeight; setup(); };
    window.addEventListener('resize', onResize);

    let animId, lastT=null;
    const frame = (now) => {
      const dt = lastT ? Math.min(now-lastT,50) : 16; lastT=now;
      const ds = dt/16;

      // Clean clear — no trail accumulation
      ctx.clearRect(0, 0, VW, VH);

      for (const f of flies) {
        // Fade in on spawn
        f.alpha = Math.min(1, f.alpha + 0.012*ds);
        // Smooth glow pulse — never fully off
        f.phase += f.blinkSpd * ds;
        const bright = 0.35 + 0.65 * ((Math.sin(f.phase)+1)/2);

        if (f.paused) {
          // Hover: gentle Lissajous oscillation while stationary
          f.pauseTimer -= dt;
          f.hoverPhase += 0.022*ds;
          f.vx += Math.sin(f.hoverPhase)       * f.hoverAmp * 0.012 * ds;
          f.vy += Math.cos(f.hoverPhase * 0.7) * f.hoverAmp * 0.010 * ds;
          f.vx *= Math.pow(0.88, ds);
          f.vy *= Math.pow(0.88, ds);
          if (f.pauseTimer <= 0) {
            f.paused = false;
            f.moveTimer    = 1200 + Math.random()*3000;
            f.targetAngle  = Math.random()*Math.PI*2;
            f.turnT = 0;
            f.speed = 0.15 + Math.random()*0.55;
          }
        } else {
          // Move: ease toward target angle, organic mid-flight nudges
          f.moveTimer -= dt;
          f.turnT = Math.min(1, f.turnT + 0.008*ds);
          const cur = Math.atan2(f.vy, f.vx);
          const diff = ((f.targetAngle - cur + 3*Math.PI) % (2*Math.PI)) - Math.PI;
          const blended = cur + diff * Math.min(f.turnT, 0.06);
          f.vx = Math.cos(blended)*f.speed;
          f.vy = Math.sin(blended)*f.speed;
          if (f.moveTimer <= 0) {
            f.paused = true;
            f.pauseTimer = 800 + Math.random()*2400;
          } else if (Math.random() < 0.004*ds) {
            f.targetAngle += (Math.random()-0.5)*Math.PI*0.8;
            f.turnT = 0;
          }
        }

        // Speed cap
        const sp = Math.sqrt(f.vx*f.vx + f.vy*f.vy);
        if (sp > f.speed+0.02) { f.vx*=f.speed/sp; f.vy*=f.speed/sp; }

        // Soft boundary nudge
        const mg = 60;
        if (f.x < mg)      f.vx += 0.018*(mg-f.x)/mg;
        if (f.x > VW-mg)   f.vx -= 0.018*(f.x-(VW-mg))/mg;
        if (f.y < mg)      f.vy += 0.014*(mg-f.y)/mg;
        if (f.y > VH-mg)   f.vy -= 0.014*(f.y-(VH-mg))/mg;

        f.x += f.vx*ds; f.y += f.vy*ds;

        // ── Draw 3-layer glow ─────────────────────────────────────────
        const [hH,hS,hL] = f.pal.h;
        const [cH,cS,cL] = f.pal.c;
        const ga = (f.alpha * bright).toFixed(3);

        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        // Wide diffuse aura
        const og = ctx.createRadialGradient(f.x,f.y,0, f.x,f.y,f.glowR);
        og.addColorStop(0,   `hsla(${hH},${hS}%,${hL}%,${+(ga*0.22).toFixed(3)})`);
        og.addColorStop(0.5, `hsla(${hH},${hS}%,${hL}%,${+(ga*0.08).toFixed(3)})`);
        og.addColorStop(1,   `hsla(${hH},${hS}%,${hL}%,0)`);
        ctx.fillStyle = og;
        ctx.beginPath(); ctx.arc(f.x,f.y,f.glowR,0,Math.PI*2); ctx.fill();

        // Mid luminous halo
        const hR = f.core * 3.5;
        const hg = ctx.createRadialGradient(f.x,f.y,0, f.x,f.y,hR);
        hg.addColorStop(0,   `hsla(${hH},${hS}%,${hL}%,${+(+ga*0.75).toFixed(3)})`);
        hg.addColorStop(0.6, `hsla(${hH},${hS}%,${hL}%,${+(+ga*0.25).toFixed(3)})`);
        hg.addColorStop(1,   `hsla(${hH},${hS}%,${hL}%,0)`);
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(f.x,f.y,hR,0,Math.PI*2); ctx.fill();

        // Tight bright core
        const cg = ctx.createRadialGradient(f.x,f.y,0, f.x,f.y,f.core);
        cg.addColorStop(0,   `hsla(${cH},${cS}%,${cL}%,${+(+ga*0.98).toFixed(3)})`);
        cg.addColorStop(0.5, `hsla(${cH},${cS}%,${cL-8}%,${+(+ga*0.65).toFixed(3)})`);
        cg.addColorStop(1,   `hsla(${cH},${cS}%,${cL-15}%,0)`);
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(f.x,f.y,f.core,0,Math.PI*2); ctx.fill();

        ctx.restore();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      animId = requestAnimationFrame(frame);
    };
    animId = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize); };
  }, [isVisible, count]);

  if (!isVisible) return null;
  return (
    <canvas ref={canvasRef} style={{
      position:'fixed', top:0, left:0,
      width:'100vw', height:'100vh',
      zIndex, pointerEvents:'none', background:'transparent',
    }} />
  );
}


// ─── MOTHER'S DAY — carnations floating and bouncing ─────────────────────────
function MothersDayBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let VW = window.innerWidth, VH = window.innerHeight;
    let ctx;
    const setup = () => {
      canvas.width  = Math.round(VW * dpr);
      canvas.height = Math.round(VH * dpr);
      canvas.style.width  = VW + 'px';
      canvas.style.height = VH + 'px';
      ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setup();

    // ── Realistic carnation — ruffled layered petals ──────────────────────────
    // A carnation has 20-30 tightly packed petals in concentric layers,
    // each petal with a serrated/fringed tip characteristic of carnations.
    const drawCarnation = (x, y, r, col, alpha, rot) => {
      if (r < 1 || alpha < 0.02) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;

      // Parse color for gradient shading
      // We draw 4 layers from outer to inner, each slightly smaller and brighter
      const LAYERS = [
        { n:14, rScale:1.00, alphaScale:0.75, lightness:+0  },
        { n:12, rScale:0.78, alphaScale:0.85, lightness:+6  },
        { n:10, rScale:0.58, alphaScale:0.90, lightness:+12 },
        { n: 8, rScale:0.38, alphaScale:1.00, lightness:+20 },
      ];

      LAYERS.forEach((layer, li) => {
        const lr = r * layer.rScale;
        const offsetAngle = li * 0.22; // each layer rotated slightly
        for (let i = 0; i < layer.n; i++) {
          const ang = (i / layer.n) * Math.PI * 2 + offsetAngle;
          ctx.save();
          ctx.rotate(ang);
          ctx.globalAlpha = alpha * layer.alphaScale;

          // Petal shape — wide oval with fringed/notched top (carnation characteristic)
          const pw = lr * 0.42;  // petal width
          const ph = lr * 0.82;  // petal height

          ctx.beginPath();
          ctx.moveTo(0, 0);
          // Left side
          ctx.bezierCurveTo(-pw*0.6, -ph*0.3, -pw*0.9, -ph*0.6, -pw*0.7, -ph);
          // Fringed top — 3 small notches
          ctx.bezierCurveTo(-pw*0.5, -ph*1.10, -pw*0.3, -ph*1.05, -pw*0.15, -ph);
          ctx.bezierCurveTo(-pw*0.05,-ph*1.08,  pw*0.05,-ph*1.08,  pw*0.15, -ph);
          ctx.bezierCurveTo( pw*0.3, -ph*1.05,  pw*0.5, -ph*1.10,  pw*0.7,  -ph);
          // Right side
          ctx.bezierCurveTo(pw*0.9, -ph*0.6, pw*0.6, -ph*0.3, 0, 0);
          ctx.closePath();

          // Gradient: lighter at tip, deeper at base
          const pg = ctx.createLinearGradient(0, 0, 0, -ph*1.1);
          pg.addColorStop(0,    col + 'dd');
          pg.addColorStop(0.35, col + 'ee');
          pg.addColorStop(0.70, col + 'cc');
          pg.addColorStop(1,    col + 'aa');
          ctx.fillStyle = pg;
          ctx.fill();

          // Subtle edge stroke for definition
          ctx.strokeStyle = col + '55';
          ctx.lineWidth = 0.4;
          ctx.stroke();

          ctx.restore();
        }
      });

      // Dense centre — tight cluster of tiny petals
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.20);
      cg.addColorStop(0, '#ffffff88');
      cg.addColorStop(0.5, col + 'cc');
      cg.addColorStop(1, col + '88');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    // ── Color palette: pink, blue, red, yellow, gold, purple ─────────────────
    const CARNATION_COLS = [
      '#FF69B4', '#FF1493', '#FFB6C1',   // pinks
      '#4169E1', '#6495ED', '#87CEEB',   // blues
      '#DC143C', '#B22222', '#FF6347',   // reds
      '#FFD700', '#FFA500', '#FFEC8B',   // yellows / gold
      '#8A2BE2', '#9370DB', '#DDA0DD',   // purples
    ];

    // ── Carnation particle factory ─────────────────────────────────────────────
    const mkC = () => {
      const r    = 14 + Math.random() * 32;          // size 14–46px
      const col  = CARNATION_COLS[Math.floor(Math.random() * CARNATION_COLS.length)];
      const ang  = Math.random() * Math.PI * 2;
      const spd  = 0.4 + Math.random() * 1.4;        // speed variety
      return {
        x:    Math.random() * VW,
        y:    Math.random() * VH,                    // spawn anywhere on screen
        r, col,
        vx:   Math.cos(ang) * spd,
        vy:   Math.sin(ang) * spd,
        rot:  Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.030,
        // Soft bounce: each carnation has a slight gravity pull
        gravity: 0.008 + Math.random() * 0.018,
        alpha: 0.72 + Math.random() * 0.26,
        // Breathing: petal scale oscillation (carnations sway in breeze)
        breathPh:  Math.random() * Math.PI * 2,
        breathSpd: 0.015 + Math.random() * 0.020,
        breathAmp: 0.04 + Math.random() * 0.06,
      };
    };

    const COUNT = 28;
    const carnations = Array.from({ length: COUNT }, mkC);

    const onResize = () => { VW=window.innerWidth; VH=window.innerHeight; setup(); };
    window.addEventListener('resize', onResize);
    let animId, lastT = null;

    const frame = now => {
      const dt = lastT ? Math.min(now-lastT, 50) : 16; lastT = now;
      const ds = dt / 16;
      ctx.clearRect(0, 0, VW, VH);

      for (const c of carnations) {
        // Gravity pulls downward
        c.vy += c.gravity * ds;

        // Slight air resistance — velocity damping
        c.vx *= Math.pow(0.998, ds);
        c.vy *= Math.pow(0.998, ds);

        // Update position
        c.x += c.vx * ds;
        c.y += c.vy * ds;
        c.rot += c.rotV * ds;

        // Breath oscillation — size pulsing
        c.breathPh += c.breathSpd * ds;
        const breathScale = 1 + Math.sin(c.breathPh) * c.breathAmp;

        // ── Bounce off all 4 walls ────────────────────────────────────────────
        const margin = c.r * 1.2;
        if (c.x - margin < 0) {
          c.x = margin;
          c.vx = Math.abs(c.vx) * (0.70 + Math.random() * 0.20); // slight energy loss
          c.rotV *= -0.8; // bounce reverses spin a bit
        }
        if (c.x + margin > VW) {
          c.x = VW - margin;
          c.vx = -Math.abs(c.vx) * (0.70 + Math.random() * 0.20);
          c.rotV *= -0.8;
        }
        if (c.y - margin < 0) {
          c.y = margin;
          c.vy = Math.abs(c.vy) * (0.65 + Math.random() * 0.25);
        }
        if (c.y + margin > VH) {
          c.y = VH - margin;
          c.vy = -Math.abs(c.vy) * (0.65 + Math.random() * 0.25);
          // Random horizontal nudge on floor bounce
          c.vx += (Math.random() - 0.5) * 0.5;
        }

        // Speed floor — prevent carnations from stopping completely
        const sp = Math.sqrt(c.vx*c.vx + c.vy*c.vy);
        if (sp < 0.15) {
          const a = Math.random() * Math.PI * 2;
          c.vx += Math.cos(a) * 0.25;
          c.vy += Math.sin(a) * 0.25;
        }
        // Speed ceiling
        if (sp > 3.0) { c.vx *= 3.0/sp; c.vy *= 3.0/sp; }

        drawCarnation(c.x, c.y, c.r * breathScale, c.col, c.alpha, c.rot);
      }

      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(frame);
    };
    animId = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize); };
  }, []);

  return <canvas ref={canvasRef} style={{
    position: 'fixed', top: 0, left: 0,
    width: '100vw', height: '100vh',
    pointerEvents: 'none', zIndex: 0, background: 'transparent',
  }} />;
}
// ─── FATHER'S DAY — paper planes with aerodynamics + physics ──────────────────
function FathersDayBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let VW = window.innerWidth, VH = window.innerHeight;
    let ctx;
    const setup = () => {
      canvas.width=Math.round(VW*dpr); canvas.height=Math.round(VH*dpr);
      canvas.style.width=VW+'px'; canvas.style.height=VH+'px';
      ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    };
    setup();

    // style: 0=dart, 1=delta, 2=boxed, 3=concorde
    const drawPlane=(x,y,size,heading,tilt,col,alpha,style)=>{
      if(alpha<0.02) return;
      ctx.save(); ctx.globalAlpha=alpha; ctx.translate(x,y); ctx.rotate(heading);
      ctx.scale(1, 0.82+0.18*Math.cos(tilt));
      const s=size;
      if(style===0){
        ctx.beginPath(); ctx.moveTo(s,0); ctx.lineTo(-s*0.55,-s*0.70); ctx.lineTo(-s*0.1,0); ctx.closePath();
        const tg=ctx.createLinearGradient(s,0,-s*0.55,-s*0.7);
        tg.addColorStop(0,'#fff');tg.addColorStop(0.4,col+'ff');tg.addColorStop(1,col+'88');
        ctx.fillStyle=tg; ctx.fill();
        ctx.beginPath(); ctx.moveTo(s,0); ctx.lineTo(-s*0.55,s*0.70); ctx.lineTo(-s*0.1,0); ctx.closePath();
        const bg=ctx.createLinearGradient(s,0,-s*0.55,s*0.7);
        bg.addColorStop(0,col+'ee');bg.addColorStop(1,col+'55');
        ctx.fillStyle=bg; ctx.fill();
        ctx.beginPath(); ctx.moveTo(s,0); ctx.lineTo(-s*0.12,0);
        ctx.strokeStyle='#fff9'; ctx.lineWidth=s*0.07; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s*0.5,0); ctx.lineTo(-s*0.5,-s*0.42);
        ctx.strokeStyle=col+'55'; ctx.lineWidth=0.5; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s*0.5,0); ctx.lineTo(-s*0.5,s*0.42);
        ctx.strokeStyle=col+'55'; ctx.lineWidth=0.5; ctx.stroke();
      } else if(style===1){
        ctx.beginPath(); ctx.moveTo(s*0.9,0); ctx.lineTo(-s*0.6,-s*1.0); ctx.lineTo(-s*0.2,-s*0.12); ctx.lineTo(-s*0.5,0); ctx.closePath();
        const dg=ctx.createLinearGradient(s*0.9,0,-s*0.6,-s);
        dg.addColorStop(0,'#fff');dg.addColorStop(0.35,col+'ff');dg.addColorStop(1,col+'77');
        ctx.fillStyle=dg; ctx.fill();
        ctx.beginPath(); ctx.moveTo(s*0.9,0); ctx.lineTo(-s*0.6,s*1.0); ctx.lineTo(-s*0.2,s*0.12); ctx.lineTo(-s*0.5,0); ctx.closePath();
        const dg2=ctx.createLinearGradient(s*0.9,0,-s*0.6,s);
        dg2.addColorStop(0,col+'dd');dg2.addColorStop(1,col+'44');
        ctx.fillStyle=dg2; ctx.fill();
        ctx.beginPath(); ctx.moveTo(s*0.9,0); ctx.lineTo(-s*0.5,0);
        ctx.strokeStyle='#fff9'; ctx.lineWidth=s*0.08; ctx.stroke();
      } else if(style===2){
        ctx.beginPath(); ctx.moveTo(s*0.8,0);ctx.lineTo(s*0.1,-s*0.6);ctx.lineTo(-s*0.55,-s*0.65);ctx.lineTo(-s*0.55,-s*0.1);ctx.lineTo(-s*0.1,0);ctx.closePath();
        ctx.fillStyle=col+'ee'; ctx.fill(); ctx.strokeStyle='#fff6';ctx.lineWidth=0.6;ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s*0.8,0);ctx.lineTo(s*0.1,s*0.6);ctx.lineTo(-s*0.55,s*0.65);ctx.lineTo(-s*0.55,s*0.1);ctx.lineTo(-s*0.1,0);ctx.closePath();
        ctx.fillStyle=col+'bb'; ctx.fill(); ctx.strokeStyle='#fff4';ctx.lineWidth=0.6;ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s*0.8,0);ctx.lineTo(-s*0.1,0);
        ctx.strokeStyle='#fffb';ctx.lineWidth=s*0.09;ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(s*1.1,0);
        ctx.bezierCurveTo(s*0.4,-s*0.12,-s*0.2,-s*0.55,-s*0.65,-s*0.8);
        ctx.lineTo(-s*0.65,-s*0.08); ctx.closePath();
        const cg=ctx.createLinearGradient(s*1.1,0,-s*0.65,-s*0.8);
        cg.addColorStop(0,'#fff');cg.addColorStop(0.4,col+'ff');cg.addColorStop(1,col+'66');
        ctx.fillStyle=cg; ctx.fill();
        ctx.beginPath(); ctx.moveTo(s*1.1,0);
        ctx.bezierCurveTo(s*0.4,s*0.12,-s*0.2,s*0.55,-s*0.65,s*0.8);
        ctx.lineTo(-s*0.65,s*0.08); ctx.closePath();
        const cg2=ctx.createLinearGradient(s*1.1,0,-s*0.65,s*0.8);
        cg2.addColorStop(0,col+'ee');cg2.addColorStop(1,col+'44');
        ctx.fillStyle=cg2; ctx.fill();
        ctx.beginPath(); ctx.moveTo(s*1.1,0);ctx.lineTo(-s*0.65,0);
        ctx.strokeStyle='#fff9';ctx.lineWidth=s*0.06;ctx.stroke();
      }
      ctx.restore();
    };

    const drawStar=(x,y,r,col,alpha)=>{
      ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.beginPath();
      for(let i=0;i<12;i++){const ang=(i*Math.PI)/6,rd=i%2===0?r:r*0.42;
        i===0?ctx.moveTo(Math.cos(ang)*rd,Math.sin(ang)*rd):ctx.lineTo(Math.cos(ang)*rd,Math.sin(ang)*rd);}
      ctx.closePath();ctx.fillStyle=col;ctx.fill();ctx.restore();
    };

    let windX=0.4,windTarget=0.4,windTimer=0;

    const PLANE_COLS=['#0d47a1','#1e88e5','#42a5f5','#ffffff','#f5f5f5','#ff8f00','#ffa000','#1b5e20','#388e3c','#b71c1c','#e53935'];

    const mkPlane=()=>{
      const style=Math.floor(Math.random()*4);
      const spdBase=style===3?1.5:style===1?1.1:style===2?0.6:1.0;
      const size=8+Math.random()*22;
      const spd=(0.35+Math.random()*1.3)*spdBase;
      const heading=-Math.PI*0.12+(Math.random()-0.5)*0.5;
      return {
        x:-size*2, y:VH*0.05+Math.random()*VH*0.88,
        size,style,col:PLANE_COLS[Math.floor(Math.random()*PLANE_COLS.length)],
        heading,spd,vx:Math.cos(heading)*spd,vy:Math.sin(heading)*spd,
        drag:0.012+style*0.004,
        waveFq:0.012+Math.random()*0.018,wavePh:Math.random()*Math.PI*2,
        waveAmp:0.06+Math.random()*0.25,
        tilt:0,alpha:0.60+Math.random()*0.38,trail:[],
      };
    };
    const mkStar=()=>({
      x:Math.random()*VW,y:Math.random()*VH,r:1.5+Math.random()*5,
      col:['#ffd700','#ffe082','#ffffff','#b3e5fc'][Math.floor(Math.random()*4)],
      ph:Math.random()*Math.PI*2,sp:0.012+Math.random()*0.022,
      alpha:0.25+Math.random()*0.55,vy:-(0.03+Math.random()*0.07),vx:(Math.random()-0.5)*0.05,
    });
    const mkOrb=()=>({
      x:Math.random()*VW,y:Math.random()*VH,r:25+Math.random()*60,
      col:['#0d47a1','#1565c0','#01579b','#00695c'][Math.floor(Math.random()*4)],
      ph:Math.random()*Math.PI*2,sp:0.004+Math.random()*0.007,alpha:0.05+Math.random()*0.09,
    });

    const planes=Array.from({length:14},mkPlane);
    const stars =Array.from({length:28},mkStar);
    const orbs  =Array.from({length:10},mkOrb);
    planes.forEach((pl,i)=>{ pl.x=(i/planes.length)*VW*1.2-VW*0.1; });

    const onResize=()=>{VW=window.innerWidth;VH=window.innerHeight;setup();};
    window.addEventListener('resize',onResize);
    let animId,lastT=null;

    const frame=now=>{
      const dt=lastT?Math.min(now-lastT,50):16; lastT=now; const ds=dt/16;
      ctx.clearRect(0,0,VW,VH);

      windTimer+=dt;
      if(windTimer>4000+Math.random()*4000){
        windTarget=0.2+Math.random()*0.9;
        if(Math.random()<0.25) windTarget*=-0.4;
        windTimer=0;
      }
      windX+=(windTarget-windX)*0.015*ds;

      for(const o of orbs){
        o.ph+=o.sp*ds; const p=0.75+0.25*Math.sin(o.ph);
        ctx.save();ctx.globalAlpha=o.alpha*p;ctx.globalCompositeOperation='screen';
        const g=ctx.createRadialGradient(o.x,o.y,0,o.x,o.y,o.r*p);
        g.addColorStop(0,o.col+'ff');g.addColorStop(0.5,o.col+'55');g.addColorStop(1,o.col+'00');
        ctx.fillStyle=g;ctx.beginPath();ctx.arc(o.x,o.y,o.r*p,0,Math.PI*2);ctx.fill();ctx.restore();
      }

      for(const s of stars){
        s.ph+=s.sp*ds; s.x+=s.vx*ds; s.y+=s.vy*ds;
        if(s.y<-s.r*2) Object.assign(s,mkStar());
        const blink=0.5+0.5*Math.sin(s.ph);
        drawStar(s.x,s.y,s.r*(0.7+0.3*blink),s.col,s.alpha*blink);
      }

      for(const pl of planes){
        pl.wavePh+=pl.waveFq*ds;
        const pitchOsc=Math.sin(pl.wavePh)*pl.waveAmp;
        // Gravity
        pl.vy+=0.018*ds;
        // Lift proportional to speed
        const spd=Math.sqrt(pl.vx*pl.vx+pl.vy*pl.vy);
        const liftF=spd*0.022*(1-pl.drag*3);
        pl.vy-=liftF*ds;
        // Wind
        pl.vx+=windX*0.012*ds;
        // Pitch oscillation
        pl.vy+=pitchOsc*0.018*ds;
        // Drag
        pl.vx*=(1-pl.drag*ds*0.5); pl.vy*=(1-pl.drag*ds*0.3);
        // Speed cap
        const sp2=Math.sqrt(pl.vx*pl.vx+pl.vy*pl.vy);
        if(sp2>pl.spd*1.8){pl.vx*=pl.spd*1.8/sp2;pl.vy*=pl.spd*1.8/sp2;}
        // Heading follows velocity
        if(sp2>0.05) pl.heading=Math.atan2(pl.vy,pl.vx)*0.08+pl.heading*0.92;
        pl.tilt=Math.atan2(pl.vy,pl.vx)*0.5;
        pl.x+=pl.vx*ds; pl.y+=pl.vy*ds;
        pl.trail.unshift({x:pl.x,y:pl.y});
        if(pl.trail.length>22) pl.trail.pop();
        if(pl.x>VW+80||pl.y>VH+60||pl.y<-60) Object.assign(pl,mkPlane());
        // Trail
        for(let i=1;i<pl.trail.length;i++){
          if(i%2!==0) continue;
          const ta=pl.alpha*(1-i/pl.trail.length)*0.40;
          ctx.save();ctx.globalAlpha=ta;
          ctx.beginPath();ctx.arc(pl.trail[i].x,pl.trail[i].y,1.0,0,Math.PI*2);
          ctx.fillStyle=pl.col+'dd';ctx.fill();ctx.restore();
        }
        drawPlane(pl.x,pl.y,pl.size,pl.heading,pl.tilt,pl.col,pl.alpha,pl.style);
      }

      ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
      animId=requestAnimationFrame(frame);
    };
    animId=requestAnimationFrame(frame);
    return()=>{cancelAnimationFrame(animId);window.removeEventListener('resize',onResize);};
  },[]);
  return <canvas ref={canvasRef} style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',pointerEvents:'none',zIndex:0,background:'transparent'}} />;
}
// ─── ANNIVERSARY BACKGROUND — roses, gold bokeh, floating hearts ─────────────
function AnniversaryBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let VW = window.innerWidth, VH = window.innerHeight;
    let ctx;
    const setup = () => {
      canvas.width  = Math.round(VW * dpr);
      canvas.height = Math.round(VH * dpr);
      canvas.style.width  = VW + 'px';
      canvas.style.height = VH + 'px';
      ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setup();

    // ── Realistic rose petal — cupped, veined, botanically accurate ──────────
    // A rose petal is asymmetric: broad rounded top, tapering to a narrower base
    // We draw it centred at origin pointing upward, then transform into place.
    const drawRosePetal = (x, y, w, h, rot, tiltX, tiltY, hue, sat, lit, alpha) => {
      if (alpha < 0.01) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      // 3-D perspective: tiltX squeezes width (edge-on = narrow), tiltY curls top
      ctx.scale(Math.abs(Math.cos(tiltX)), 1 + Math.sin(tiltY) * 0.18);

      // Petal outline — asymmetric rose petal shape
      ctx.beginPath();
      // Start at base tip (bottom centre)
      ctx.moveTo(0, h * 0.42);
      // Left side — sweeps wide then rounds the top
      ctx.bezierCurveTo(
        -w * 0.55,  h * 0.20,
        -w * 0.72, -h * 0.10,
        -w * 0.50, -h * 0.38
      );
      // Top left lobe — the characteristic rose-petal top bulge
      ctx.bezierCurveTo(
        -w * 0.38, -h * 0.52,
        -w * 0.12, -h * 0.50,
         0,        -h * 0.48
      );
      // Top right lobe (slightly different, petals are asymmetric)
      ctx.bezierCurveTo(
         w * 0.14, -h * 0.50,
         w * 0.42, -h * 0.50,
         w * 0.52, -h * 0.36
      );
      // Right side back to base
      ctx.bezierCurveTo(
         w * 0.74, -h * 0.08,
         w * 0.58,  h * 0.20,
         0,         h * 0.42
      );
      ctx.closePath();

      // Multi-stop gradient: deep red centre, bright mid, translucent edge
      const ctr = ctx.createRadialGradient(0, -h*0.05, 0, 0, -h*0.05, Math.max(w, h)*0.8);
      ctr.addColorStop(0,    `hsla(${hue},${sat}%,${lit-12}%,${alpha*0.98})`);
      ctr.addColorStop(0.25, `hsla(${hue},${sat}%,${lit}%,${alpha*0.96})`);
      ctr.addColorStop(0.55, `hsla(${hue+4},${sat-5}%,${lit+8}%,${alpha*0.90})`);
      ctr.addColorStop(0.80, `hsla(${hue+6},${sat-10}%,${lit+18}%,${alpha*0.75})`);
      ctr.addColorStop(1,    `hsla(${hue+8},${sat-18}%,${lit+28}%,${alpha*0.30})`);
      ctx.fillStyle = ctr;
      ctx.fill();

      // Soft inner highlight — the silky sheen of a real petal
      const shine = ctx.createRadialGradient(-w*0.18, -h*0.28, 0, -w*0.18, -h*0.28, w*0.38);
      shine.addColorStop(0,   `rgba(255,230,230,${alpha*0.30})`);
      shine.addColorStop(0.5, `rgba(255,210,210,${alpha*0.12})`);
      shine.addColorStop(1,   'rgba(255,200,200,0)');
      ctx.fillStyle = shine;
      ctx.fill();

      // Veins — main central vein + 4 side veins
      ctx.strokeStyle = `hsla(${hue-5},${sat+5}%,${lit-22}%,${alpha*0.28})`;
      ctx.lineWidth = 0.7;
      ctx.lineCap = 'round';
      // Central vein
      ctx.beginPath();
      ctx.moveTo(0, h*0.38); ctx.bezierCurveTo(0, h*0.10, 0, -h*0.18, 0, -h*0.44);
      ctx.stroke();
      // Side veins — fan outward from mid-vein
      ctx.lineWidth = 0.45;
      const veins = [
        [-0.08,-0.10, -0.38,-0.28], [-0.06, 0.05, -0.40,-0.05],
        [-0.06, 0.18, -0.36, 0.12], [ 0.08,-0.10,  0.36,-0.28],
        [ 0.06, 0.05,  0.38,-0.05], [ 0.06, 0.18,  0.34, 0.12],
      ];
      for (const [x1,y1,x2,y2] of veins) {
        ctx.beginPath();
        ctx.moveTo(x1*w, y1*h);
        ctx.quadraticCurveTo((x1+x2)*0.5*w*1.1, (y1+y2)*0.5*h, x2*w, y2*h);
        ctx.stroke();
      }

      // Subtle edge darkening (depth of fold)
      ctx.strokeStyle = `hsla(${hue-8},${sat}%,${lit-28}%,${alpha*0.18})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, h*0.42);
      ctx.bezierCurveTo(-w*0.55, h*0.20, -w*0.72,-h*0.10, -w*0.50,-h*0.38);
      ctx.bezierCurveTo(-w*0.38,-h*0.52, -w*0.12,-h*0.50, 0,-h*0.48);
      ctx.bezierCurveTo(w*0.14,-h*0.50, w*0.42,-h*0.50, w*0.52,-h*0.36);
      ctx.bezierCurveTo(w*0.74,-h*0.08, w*0.58, h*0.20, 0, h*0.42);
      ctx.stroke();

      ctx.restore();
    };

    // ── Gold bokeh background orbs ────────────────────────────────────────────
    const BOKEH_COLS = ['#ffd700','#ffb300','#ffe082','#fff8e1','#f9a825'];
    const mkBokeh = () => ({
      x: Math.random()*VW, y: VH + 20 + Math.random()*VH*0.3,
      r: 6 + Math.random()*22,
      col: BOKEH_COLS[Math.floor(Math.random()*BOKEH_COLS.length)],
      vy: -(0.28+Math.random()*0.45), vx: (Math.random()-0.5)*0.25,
      ph: Math.random()*Math.PI*2, sp: 0.007+Math.random()*0.014,
      alpha: 0.10+Math.random()*0.22,
    });

    // ── "24 / 7" floating text ────────────────────────────────────────────────
    const mkText = () => ({
      x: VW*0.05 + Math.random()*VW*0.90,
      y: VH + 20 + Math.random()*VH*0.6,
      vy: -(0.16+Math.random()*0.26), vx: (Math.random()-0.5)*0.14,
      alpha: 0.055+Math.random()*0.09,
      size: 26+Math.random()*34,
      rot: (Math.random()-0.5)*0.28,
      ph: Math.random()*Math.PI*2, sp: 0.005+Math.random()*0.010,
    });

    // ── Petal physics ─────────────────────────────────────────────────────────
    // Red rose palette: hue 0–12, sat 70–90, lit 28–50
    const mkPetal = () => {
      const w = 18 + Math.random() * 30;          // width 18–48px
      const h = w * (0.7 + Math.random() * 0.5);  // height ~0.7–1.2× width
      const hue = 2  + Math.random() * 10;         // crimson–red
      const sat = 72 + Math.random() * 18;
      const lit = 30 + Math.random() * 20;
      return {
        x:  Math.random() * VW,
        y: -h - Math.random() * VH * 0.5,          // spawn above screen
        w, h, hue, sat, lit,
        rot:  Math.random() * Math.PI * 2,
        // Spin axes — tiltX creates edge-on flip, tiltY creates cup curl
        tiltX:  Math.random() * Math.PI * 2,
        tiltY:  (Math.random()-0.5) * 0.6,
        tiltXv: (Math.random()-0.5) * 0.032,        // tumble speed
        tiltYv: (Math.random()-0.5) * 0.012,
        rotV:   (Math.random()-0.5) * 0.020,        // rotation in 2D
        // Fall physics
        vx:   (Math.random()-0.5) * 0.8,
        vy:   0.6 + Math.random() * 1.2,            // gravity driven
        mass: 0.6 + Math.random() * 0.6,            // affects drag
        // Pendulum sway
        sph:  Math.random() * Math.PI * 2,
        sfq:  0.018 + Math.random() * 0.022,
        samp: 0.020 + Math.random() * 0.045,
        alpha: 0.72 + Math.random() * 0.26,
      };
    };

    // Wind state
    let windX = 0, windTarget = 0.3, windTimer = 0;

    const petals = Array.from({length: 38}, mkPetal);
    // Stagger initial y positions
    petals.forEach((p, i) => { p.y = -p.h + (i/38) * VH * 0.9; });

    const bokeh = Array.from({length: 16}, mkBokeh);
    const texts = Array.from({length: 8},  mkText);

    const onResize = () => { VW=window.innerWidth; VH=window.innerHeight; setup(); };
    window.addEventListener('resize', onResize);
    let animId, lastT = null;

    const frame = now => {
      const dt = lastT ? Math.min(now-lastT,50) : 16; lastT=now; const ds=dt/16;
      ctx.clearRect(0, 0, VW, VH);

      // Wind evolution
      windTimer += dt;
      if (windTimer > 3500 + Math.random()*4000) {
        windTarget = (Math.random()-0.45)*1.8;
        windTimer = 0;
      }
      windX += (windTarget-windX) * 0.012 * ds;

      // Gold bokeh — soft, rising
      for (const b of bokeh) {
        b.ph += b.sp*ds; b.x += Math.sin(b.ph)*0.25*ds; b.y += b.vy*ds;
        if (b.y < -b.r*3) Object.assign(b, mkBokeh());
        const p = 0.72+0.28*Math.sin(b.ph);
        ctx.save(); ctx.globalAlpha=b.alpha*p; ctx.globalCompositeOperation='screen';
        const g=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r*p);
        g.addColorStop(0,b.col+'ff');g.addColorStop(0.5,b.col+'88');g.addColorStop(1,b.col+'00');
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(b.x,b.y,b.r*p,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }

      // Update + draw each petal
      for (const p of petals) {
        // Wind force scaled by petal size (larger petals catch more wind)
        p.vx += windX * 0.014 * (p.w/30) * ds;
        // Pendulum lateral sway (air turbulence)
        p.sph += p.sfq * ds;
        p.vx += Math.sin(p.sph) * p.samp * ds;
        // Air drag — opposes velocity, varies with tilt (edge-on = less drag)
        const dragFactor = 0.015 + 0.010 * Math.abs(Math.cos(p.tiltX));
        p.vx *= (1 - dragFactor * ds);
        p.vy *= (1 - dragFactor * 0.5 * ds);
        // Gravity (lighter petals fall slower)
        p.vy += (0.028 / p.mass) * ds;
        // Terminal velocity
        if (p.vy > 3.2) p.vy = 3.2;
        p.x += p.vx * ds;
        p.y += p.vy * ds;
        // Tumble — tiltX flips edge-on (slows falling speed), tiltY curls
        p.tiltX += p.tiltXv * ds;
        p.tiltY += p.tiltYv * ds;
        p.rot   += p.rotV * ds;
        // Clamp tiltY so petals don't invert
        p.tiltY = Math.max(-0.7, Math.min(0.7, p.tiltY));
        // Respawn
        if (p.y > VH + p.h + 20 || p.x < -VW*0.3 || p.x > VW*1.3) {
          Object.assign(p, mkPetal());
        }
        // Alpha pulses very slightly with tiltX (edge-on = more transparent)
        const tiltAlpha = 0.55 + 0.45 * Math.abs(Math.cos(p.tiltX));
        drawRosePetal(p.x, p.y, p.w, p.h, p.rot, p.tiltX, p.tiltY,
                      p.hue, p.sat, p.lit, p.alpha * tiltAlpha);
      }

      // "24 / 7" floating text
      ctx.globalCompositeOperation = 'source-over';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const tx of texts) {
        tx.ph += tx.sp*ds; tx.x += tx.vx*ds; tx.y += tx.vy*ds;
        if (tx.y < -tx.size*2) Object.assign(tx, mkText());
        const pulse = 0.55+0.45*Math.sin(tx.ph);
        ctx.save(); ctx.globalAlpha=tx.alpha*pulse;
        ctx.translate(tx.x, tx.y); ctx.rotate(tx.rot);
        ctx.font = `100 ${tx.size}px Georgia, serif`;
        ctx.fillStyle = '#8b0000';
        ctx.fillText('24 / 7', 0, 0);
        ctx.restore();
      }

      ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
      animId = requestAnimationFrame(frame);
    };
    animId = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize); };
  }, []);

  return <canvas ref={canvasRef} style={{
    position:'fixed', top:0, left:0,
    width:'100vw', height:'100vh',
    pointerEvents:'none', zIndex:0, background:'transparent',
  }} />;
}

// ─── OTSUKIMI — Mid-Autumn Festival canvas scene ─────────────────────────────
function OtsukimiBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = window.innerWidth || 390, H = window.innerHeight || 844;
    let ctx, T = 0, lastNow = null, animId;

    const setup = () => {
      W = window.innerWidth || 390; H = window.innerHeight || 844;
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setup();

    // ── Deterministic hash ───────────────────────────────────────────────────
    const hash = n => { const s = Math.sin(n) * 43758.5453; return s - Math.floor(s); };

    // ── Stars ────────────────────────────────────────────────────────────────
    const STARS = Array.from({ length: 210 }, (_, i) => ({
      x:        hash(i * 13.7)  * W,
      y:        hash(i * 7.31)  * H * 0.78,
      r:        0.18 + hash(i * 19.3) * 1.0,
      hz:       0.45 + hash(i * 3.77) * 1.90,
      phase:    hash(i * 5.53)  * Math.PI * 2,
      minAlpha: 0.22 + hash(i * 11.9) * 0.38,
    }));

    // ── Susuki grass ─────────────────────────────────────────────────────────
    const bladeCount = Math.max(36, Math.min(58, Math.floor(W / 14)));
    const smoothNoise = x => {
      const i = Math.floor(x), f = x - i;
      const sf = f * f * (3 - 2 * f);
      return hash(i * 127.1 + 311.7) * (1 - sf) + hash((i + 1) * 127.1 + 311.7) * sf;
    };
    const BLADES = Array.from({ length: bladeCount }, (_, i) => {
      const layer = Math.floor(hash(i * 17.3) * 3);
      const ds    = 0.55 + layer * 0.225;
      const len   = (78 + hash(i * 23.1) * 118) * ds;
      const bi    = i;
      // Pre-compute 16 plume hairs per blade
      const hairs = Array.from({ length: 16 }, (_, h) => ({
        angle:  (hash(bi * 31.1 + h * 7.3) - 0.5) * Math.PI * 1.5,
        length: (11 + hash(bi * 41.7 + h * 11.3) * 27) * ds,
      }));
      return {
        x:         hash(i * 29.9) * (W + 60) - 30,
        baseY:     H - hash(i * 37.1) * 22,
        layer,
        len,
        lean:      (hash(i * 43.3) - 0.5) * 0.40,
        stiffness: 0.30 + hash(i * 61.7) * 0.38,
        freq:      0.52 + hash(i * 53.3) * 0.68,
        phase:     hash(i * 71.9) * Math.PI * 2,
        width:     (0.85 + hash(i * 83.1) * 1.5),
        hasPlume:  hash(i * 97.3) < 0.80,
        hairs,
        alpha:     0.35 + (layer / 2) * 0.40,
      };
    }).sort((a, b) => a.layer - b.layer);

    // ── Ambient motes ────────────────────────────────────────────────────────
    const MOTES = Array.from({ length: 22 }, (_, i) => ({
      x:     hash(i * 13.1) * W,
      y:     hash(i * 17.3) * H,
      r:     0.25 + hash(i * 23.7) * 1.35,
      vy:    0.055 + hash(i * 31.1) * 0.130,
      vx:    (hash(i * 41.3) - 0.5) * 0.164,
      phase: hash(i * 53.7) * Math.PI * 2,
      op:    0.28 + hash(i * 67.1) * 0.40,
    }));

    // ── Rabbit state machine ──────────────────────────────────────────────────
    const RABBIT_CYCLE = [
      { state: 'wait',     dur: 3.5 },
      { state: 'fade-in',  dur: 5.5 },
      { state: 'hold',     dur: 8.5 },
      { state: 'fade-out', dur: 5.0 },
      { state: 'pause',    dur: 12.0 },
    ];
    let rabbitPhaseIdx = 0, rabbitPhaseT = 0;

    // ── Draw moon ────────────────────────────────────────────────────────────
    const drawMoon = () => {
      const MX = W * 0.5, MY = H * 0.17;
      const MR = Math.min(W, H) * 0.333;
      const R  = MR * (1 + 0.004 * Math.sin(T * 0.11));

      ctx.save();
      ctx.beginPath();
      ctx.arc(MX, MY, R, 0, Math.PI * 2);
      ctx.clip();

      // 1. Radial gradient base — silvery watercolour surface, bright zone fills full disc
      const base = ctx.createRadialGradient(MX - R*0.23, MY - R*0.23, 0, MX, MY, R);
      base.addColorStop(0,    '#eeeeed');
      base.addColorStop(0.55, '#e0e2e8');
      base.addColorStop(0.78, '#c4c9d2');
      base.addColorStop(0.92, '#adb4c4');
      base.addColorStop(1,    '#8a93a7');
      ctx.fillStyle = base;
      ctx.fillRect(MX - R, MY - R, R * 2, R * 2);

      // 2. Dark maria — 7 soft elliptical blobs
      const MARIA = [
        { cx:-0.17, cy:-0.25, rx:0.31, ry:0.24, a:0.175 },
        { cx: 0.23, cy:-0.13, rx:0.20, ry:0.27, a:0.145 },
        { cx:-0.09, cy: 0.11, rx:0.23, ry:0.17, a:0.115 },
        { cx: 0.07, cy: 0.31, rx:0.34, ry:0.22, a:0.155 },
        { cx:-0.31, cy: 0.17, rx:0.18, ry:0.22, a:0.092 },
        { cx: 0.33, cy: 0.13, rx:0.12, ry:0.14, a:0.082 },
        { cx:-0.07, cy:-0.44, rx:0.14, ry:0.10, a:0.070 },
      ];
      for (const m of MARIA) {
        ctx.save();
        ctx.translate(MX + R * m.cx, MY + R * m.cy);
        ctx.scale(R * m.rx, R * m.ry);
        const mg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        mg.addColorStop(0,    `rgba(62,76,97,${m.a})`);
        mg.addColorStop(0.58, `rgba(62,76,97,${m.a * 0.5})`);
        mg.addColorStop(1,    'rgba(62,76,97,0)');
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // 3. Highland patches — 4 bright regions
      const HIGHLANDS = [
        { cx: 0.13, cy:-0.07, rx:0.25, ry:0.20, a:0.072 },
        { cx:-0.23, cy: 0.35, rx:0.20, ry:0.17, a:0.062 },
        { cx: 0.35, cy:-0.27, rx:0.16, ry:0.14, a:0.052 },
        { cx:-0.38, cy:-0.10, rx:0.12, ry:0.16, a:0.044 },
      ];
      for (const h of HIGHLANDS) {
        ctx.save();
        ctx.translate(MX + R * h.cx, MY + R * h.cy);
        ctx.scale(R * h.rx, R * h.ry);
        const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        hg.addColorStop(0,    `rgba(255,255,252,${h.a})`);
        hg.addColorStop(0.58, `rgba(255,255,252,${h.a * 0.5})`);
        hg.addColorStop(1,    'rgba(255,255,252,0)');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // 4. Crater speckles — 30 deterministic dots
      for (let i = 0; i < 30; i++) {
        const ang  = hash(i * 7.13)  * Math.PI * 2;
        const dist = hash(i * 13.77) * R * 0.88;
        const cr   = 1.4 + hash(i * 19.31) * 8.5;
        const ca   = 0.028 + hash(i * 29.07) * 0.055;
        ctx.beginPath();
        ctx.arc(MX + Math.cos(ang)*dist, MY + Math.sin(ang)*dist, cr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,250,${ca})`;
        ctx.fill();
      }

      // 5. Limb darkening vignette
      const vig = ctx.createRadialGradient(MX, MY, R * 0.58, MX, MY, R);
      vig.addColorStop(0, 'rgba(10,16,32,0)');
      vig.addColorStop(1, 'rgba(10,16,32,0.62)');
      ctx.fillStyle = vig;
      ctx.beginPath(); ctx.arc(MX, MY, R, 0, Math.PI * 2); ctx.fill();

      ctx.restore();
      return { MX, MY, MR };
    };

    // ── Draw rabbit ───────────────────────────────────────────────────────────
    const drawRabbit = (MX, MY, MR, opacity) => {
      if (opacity <= 0.005) return;
      const shimmer = 1 + 0.038 * Math.sin(T * 9.5);
      const phase   = RABBIT_CYCLE[rabbitPhaseIdx].state;
      const baseAlpha = opacity * 0.27 * (
        (phase === 'fade-in' || phase === 'fade-out') ? shimmer : 1
      );
      if (baseAlpha < 0.005) return;

      ctx.save();
      ctx.beginPath();
      ctx.arc(MX, MY, MR, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = baseAlpha;

      const s  = MR * 0.36;
      const ox = MX - MR * 0.04;
      const oy = MY + MR * 0.06;
      ctx.fillStyle   = 'rgba(48,60,78,1)';
      ctx.strokeStyle = 'rgba(48,60,78,1)';
      ctx.lineWidth   = s * 0.025;

      const ellipse = (ex, ey, rx, ry, rot) => {
        ctx.save();
        ctx.translate(ox + ex, oy + ey);
        ctx.rotate(rot || 0);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };

      ellipse(0, 0, s*0.30, s*0.41, 0);                                 // body
      ellipse(s*0.075, -s*0.445, s*0.185, s*0.175, 0.17);               // head
      ellipse(-s*0.010, -s*0.765, s*0.060, s*0.238, -0.13);             // left ear
      ellipse( s*0.172, -s*0.748, s*0.060, s*0.228,  0.19);             // right ear
      ellipse( s*0.185, -s*0.095, s*0.115, s*0.073,  0.33);             // paws

      // Kine pestle
      ctx.save(); ctx.translate(ox, oy);
      ctx.lineWidth = s * 0.050;
      ctx.beginPath();
      ctx.moveTo( s*0.265,  s*0.075);
      ctx.lineTo( s*0.305, -s*0.385);
      ctx.stroke();
      ctx.restore();
      ellipse(s*0.315, -s*0.425, s*0.058, s*0.037, 0.44);               // pestle knob

      // Tail
      ctx.save(); ctx.translate(ox - s*0.285, oy + s*0.095);
      ctx.beginPath(); ctx.arc(0, 0, s*0.063, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.restore();
    };

    // ── Draw susuki grass ────────────────────────────────────────────────────
    const drawGrass = () => {
      for (const b of BLADES) {
        const wind =
          (0.75 * Math.sin(T * 0.32 + b.phase) +
           0.23 * Math.sin(T * 1.08 * b.freq + b.phase * 1.42) +
           smoothNoise(T * 0.11 + b.phase * 0.52) * 0.40 - 0.20
          ) * (1 - b.stiffness);
        const angle = b.lean + wind;
        const d = b.layer / 2;

        const r = Math.round(66  + d * 65);
        const g = Math.round(60  + d * 55);
        const bv= Math.round(36  + d * 25);

        const cpx = b.x + Math.sin(angle * 0.5) * b.len * 0.52;
        const cpy = b.baseY - b.len * 0.52 * Math.cos(Math.abs(angle * 0.5) * 0.72 + 0.07);
        const tx  = b.x  + Math.sin(angle)       * b.len;
        const ty  = b.baseY - b.len * Math.cos(Math.abs(angle) * 0.72 + 0.07);

        ctx.beginPath();
        ctx.moveTo(b.x, b.baseY);
        ctx.quadraticCurveTo(cpx, cpy, tx, ty);
        ctx.strokeStyle = `rgba(${r},${g},${bv},${b.alpha})`;
        ctx.lineWidth   = b.width * (1 + (2 - b.layer) * 0.28);
        ctx.lineCap     = 'round';
        ctx.stroke();

        // Susuki plume hairs — pre-computed at init, drawn per frame
        if (b.hasPlume) {
          const bladeAngle = Math.atan2(ty - cpy, tx - cpx);
          ctx.strokeStyle = `rgba(205,190,122,${b.alpha * 0.50})`;
          ctx.lineWidth   = 0.62;
          for (const hr of b.hairs) {
            const ha = bladeAngle + hr.angle;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + Math.cos(ha) * hr.length, ty + Math.sin(ha) * hr.length);
            ctx.stroke();
          }
        }
      }
    };

    // ── Main loop ─────────────────────────────────────────────────────────────
    const frame = now => {
      const dt = lastNow ? Math.min(now - lastNow, 50) / 1000 : 0.016;
      lastNow = now;
      T += dt;

      // Advance rabbit state machine
      rabbitPhaseT += dt;
      const curPhase = RABBIT_CYCLE[rabbitPhaseIdx];
      if (rabbitPhaseT >= curPhase.dur) {
        rabbitPhaseT -= curPhase.dur;
        rabbitPhaseIdx = (rabbitPhaseIdx + 1) % RABBIT_CYCLE.length;
      }
      const nextState = RABBIT_CYCLE[rabbitPhaseIdx].state;
      let rabbitOpacity = 0;
      if (nextState === 'hold') {
        rabbitOpacity = 1;
      } else if (nextState === 'fade-in') {
        rabbitOpacity = rabbitPhaseT / RABBIT_CYCLE[rabbitPhaseIdx].dur;
      } else if (nextState === 'fade-out') {
        rabbitOpacity = 1 - rabbitPhaseT / RABBIT_CYCLE[rabbitPhaseIdx].dur;
      }

      // 1. Sky
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0,    '#010407');
      sky.addColorStop(0.35, '#030918');
      sky.addColorStop(0.70, '#0a1025');
      sky.addColorStop(1,    '#16101c');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

      // 2. Stars
      ctx.fillStyle = '#fffef5';
      for (const s of STARS) {
        const a = s.minAlpha + (1 - s.minAlpha) * 0.5 * (1 + Math.sin(T * s.hz + s.phase));
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 3. Moon + rabbit
      const { MX, MY, MR } = drawMoon();
      drawRabbit(MX, MY, MR, rabbitOpacity);

      // 4. Ground mist
      const mist = ctx.createLinearGradient(0, H * 0.76 - 70, 0, H * 0.76 + 70);
      mist.addColorStop(0,    'rgba(130,118,90,0)');
      mist.addColorStop(0.42, 'rgba(130,118,90,0.038)');
      mist.addColorStop(1,    'rgba(130,118,90,0)');
      ctx.fillStyle = mist;
      ctx.fillRect(0, H * 0.76 - 70, W, 140);

      // 5. Ambient motes
      for (const m of MOTES) {
        m.x += m.vx; m.y -= m.vy;
        if (m.y < -5 || m.x < -5 || m.x > W + 5) {
          m.x = Math.random() * W; m.y = H + 5;
        }
        const ma = m.op * (0.52 + 0.48 * Math.sin(T * 0.62 + m.phase));
        ctx.globalAlpha = ma;
        ctx.fillStyle   = 'rgba(196,184,148,1)';
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 6. Susuki grass (on top)
      drawGrass();

      animId = requestAnimationFrame(frame);
    };

    const onResize = () => { setup(); };
    window.addEventListener('resize', onResize);
    animId = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize); };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} style={{
        position:'fixed', top:0, left:0,
        width:'100vw', height:'100vh',
        pointerEvents:'none', zIndex:0, background:'transparent',
      }} />
      {/* Text overlay — お月見 */}
      <div style={{
        position:'fixed', top:'75%', left:0, width:'100%',
        textAlign:'center', pointerEvents:'none', userSelect:'none',
        display:'flex', flexDirection:'column', alignItems:'center', gap:'6px',
        zIndex:1,
      }}>
        <div style={{
          fontSize:'2.625rem', letterSpacing:'0.55em',
          fontFamily:"'Hiragino Mincho ProN','Yu Mincho','MS Mincho',serif",
          fontWeight:300, color:'rgba(255,230,0,0.92)',
        }}>お月見</div>
        <div style={{
          fontSize:'1.285rem', letterSpacing:'0.42em',
          fontFamily:"'Georgia',serif",
          fontWeight:300, color:'rgba(255,230,0,0.65)',
          textTransform:'uppercase',
        }}>MID-AUTUMN · OTSUKIMI</div>
      </div>
    </>
  );
}

// ─── CHRISTMAS — winter night sky: blinking stars, north star, shooting stars ──
function ChristmasBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = window.innerWidth, H = window.innerHeight;
    let ctx, T = 0, lastNow = null, animId;
    const hash = n => { const x = Math.sin(n) * 43758.5453; return x - Math.floor(x); };

    const setup = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setup();

    // ── Stars (blinking) ────────────────────────────────────────────────────
    const STARS = Array.from({ length: 280 }, (_, i) => ({
      x:        hash(i * 13.7) * W,
      y:        hash(i * 7.31) * H * 0.92,
      r:        0.15 + hash(i * 19.3) * 1.1,
      hz:       0.3 + hash(i * 3.77) * 2.2,
      phase:    hash(i * 5.53) * Math.PI * 2,
      minAlpha: 0.15 + hash(i * 11.9) * 0.45,
      // Some stars twinkle faster for sparkle effect
      sparkle:  hash(i * 23.1) > 0.85,
    }));

    // ── North Star ──────────────────────────────────────────────────────────
    const NS = {
      x: W * 0.50, y: H * 0.08,
      r: 4.5,
      rays: 8,
      rayLen: 22,
    };

    // ── Shooting stars ──────────────────────────────────────────────────────
    const MAX_SHOOTS = 3;
    const shoots = [];
    const spawnShoot = () => ({
      x:     hash(Math.random() * 99991) * W * 1.2 - W * 0.1,
      y:     hash(Math.random() * 77771) * H * 0.5,
      len:   80 + hash(Math.random() * 55551) * 120,
      speed: 380 + hash(Math.random() * 33331) * 280,
      angle: 0.35 + hash(Math.random() * 11111) * 0.25, // steep diagonal
      alpha: 1,
      fade:  0.88 + hash(Math.random() * 22221) * 0.08,
      delay: hash(Math.random() * 44441) * 4.0, // stagger
      active: false,
    });
    // Initial set staggered
    for (let i = 0; i < MAX_SHOOTS; i++) {
      const s = spawnShoot();
      s.delay = i * 1.8 + hash(i * 31.1) * 2.0;
      shoots.push(s);
    }

    // ── Frame loop ──────────────────────────────────────────────────────────
    const frame = now => {
      const dt = lastNow ? Math.min(now - lastNow, 50) / 1000 : 0.016;
      lastNow = now;
      T += dt;

      // Sky gradient — deep navy/indigo winter night
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0,    '#01040b');
      sky.addColorStop(0.30, '#02091a');
      sky.addColorStop(0.65, '#04102a');
      sky.addColorStop(1,    '#060b18');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

      // ── Blinking stars ──────────────────────────────────────────────────
      for (const s of STARS) {
        const hz = s.sparkle ? s.hz * 2.5 : s.hz;
        const a  = s.minAlpha + (1 - s.minAlpha) * 0.5 * (1 + Math.sin(T * hz + s.phase));
        ctx.globalAlpha = a;
        // Sparkle stars get a tiny cross shape
        if (s.sparkle && a > 0.7) {
          ctx.strokeStyle = '#fffef5';
          ctx.lineWidth   = 0.5;
          ctx.globalAlpha = a * 0.6;
          ctx.beginPath(); ctx.moveTo(s.x - s.r * 2.5, s.y); ctx.lineTo(s.x + s.r * 2.5, s.y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(s.x, s.y - s.r * 2.5); ctx.lineTo(s.x, s.y + s.r * 2.5); ctx.stroke();
        }
        ctx.globalAlpha = a;
        ctx.fillStyle   = '#fffef5';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ── North Star ──────────────────────────────────────────────────────
      const nsPulse = 1 + 0.12 * Math.sin(T * 1.4);
      const nsR = NS.r * nsPulse;
      // Outer glow
      const nsGlow = ctx.createRadialGradient(NS.x, NS.y, 0, NS.x, NS.y, nsR * 8);
      nsGlow.addColorStop(0,   'rgba(200,220,255,0.55)');
      nsGlow.addColorStop(0.3, 'rgba(180,210,255,0.18)');
      nsGlow.addColorStop(1,   'rgba(180,210,255,0)');
      ctx.fillStyle = nsGlow;
      ctx.beginPath(); ctx.arc(NS.x, NS.y, nsR * 8, 0, Math.PI * 2); ctx.fill();
      // Rays (8-pointed star shape)
      ctx.save();
      ctx.translate(NS.x, NS.y);
      ctx.strokeStyle = 'rgba(220,235,255,0.90)';
      ctx.lineCap     = 'round';
      for (let r = 0; r < NS.rays; r++) {
        const a    = (r / NS.rays) * Math.PI * 2 + T * 0.18;
        const rLen = (r % 2 === 0 ? NS.rayLen : NS.rayLen * 0.48) * nsPulse;
        ctx.lineWidth   = r % 2 === 0 ? 1.2 : 0.7;
        ctx.globalAlpha = r % 2 === 0 ? 0.90 : 0.55;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * rLen, Math.sin(a) * rLen);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Core disc
      const nsCore = ctx.createRadialGradient(NS.x * 0, NS.y * 0, 0, 0, 0, nsR * 2);
      nsCore.addColorStop(0,   '#ffffff');
      nsCore.addColorStop(0.4, '#e8f0ff');
      nsCore.addColorStop(1,   'rgba(200,220,255,0)');
      ctx.fillStyle = nsCore;
      ctx.beginPath(); ctx.arc(0, 0, nsR * 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // ── Shooting stars ──────────────────────────────────────────────────
      for (const s of shoots) {
        s.delay -= dt;
        if (s.delay > 0) continue;
        if (!s.active) s.active = true;

        s.x += Math.cos(s.angle) * s.speed * dt;
        s.y += Math.sin(s.angle) * s.speed * dt;
        s.alpha *= Math.pow(s.fade, dt * 60);

        if (s.alpha > 0.02 && s.x < W + 100 && s.y < H + 100) {
          const tx = s.x - Math.cos(s.angle) * s.len * s.alpha;
          const ty = s.y - Math.sin(s.angle) * s.len * s.alpha;
          const grad = ctx.createLinearGradient(tx, ty, s.x, s.y);
          grad.addColorStop(0,   'rgba(255,255,255,0)');
          grad.addColorStop(0.6, `rgba(200,220,255,${s.alpha * 0.6})`);
          grad.addColorStop(1,   `rgba(255,255,255,${s.alpha})`);
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(s.x, s.y);
          ctx.strokeStyle = grad;
          ctx.lineWidth   = 1.5;
          ctx.lineCap     = 'round';
          ctx.stroke();
        } else {
          // Respawn
          const ns = spawnShoot();
          ns.delay  = 1.2 + hash(T * 37.3) * 3.5;
          Object.assign(s, ns);
        }
      }
      ctx.globalAlpha = 1;

      animId = requestAnimationFrame(frame);
    };

    const onResize = () => {
      setup();
      // Respread stars on resize
      STARS.forEach((s, i) => { s.x = hash(i * 13.7) * W; s.y = hash(i * 7.31) * H * 0.92; });
    };
    window.addEventListener('resize', onResize);
    animId = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize); };
  }, []);

  return (
    <canvas ref={canvasRef} style={{
      position:'fixed', top:0, left:0,
      width:'100vw', height:'100vh',
      pointerEvents:'none', zIndex:0,
      background:'transparent',
    }} />
  );
}


function BirthdayBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let VW = window.innerWidth, VH = window.innerHeight;
    let ctx;
    const setup = () => {
      canvas.width  = Math.round(VW * dpr);
      canvas.height = Math.round(VH * dpr);
      canvas.style.width  = VW + 'px';
      canvas.style.height = VH + 'px';
      ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setup();

    // ── Colour palettes ───────────────────────────────────────────────────────
    const BALLOON_COLS = [
      '#FF6B9D','#FF8E53','#FFD166','#06D6A0','#4CC9F0',
      '#F72585','#7209B7','#3A86FF','#FB5607','#8338EC',
    ];
    const CONFETTI_COLS = [
      '#FF6B9D','#FFD166','#06D6A0','#4CC9F0','#F72585',
      '#FF8E53','#7209B7','#3A86FF','#FFBE0B','#8338EC',
    ];

    // ── Balloons ──────────────────────────────────────────────────────────────
    const mkBalloon = () => {
      const col = BALLOON_COLS[Math.floor(Math.random() * BALLOON_COLS.length)];
      const r   = 18 + Math.random() * 22;                // radius 18–40px
      return {
        x:   VW * 0.05 + Math.random() * VW * 0.90,
        y:   VH + r + Math.random() * VH * 0.5,           // start below screen
        r, col,
        vy:  -(0.4 + Math.random() * 0.7),                // float upward
        vx:  (Math.random() - 0.5) * 0.4,
        swayPhase: Math.random() * Math.PI * 2,
        swayAmp:   0.25 + Math.random() * 0.35,
        swayFreq:  0.012 + Math.random() * 0.018,
        opacity:   0.78 + Math.random() * 0.18,
        stringLen: r * (2.2 + Math.random() * 1.2),
      };
    };

    const balloons = Array.from({ length: 14 }, mkBalloon);

    // ── Confetti ──────────────────────────────────────────────────────────────
    const mkConfetto = () => ({
      x:    Math.random() * VW,
      y:    -20 - Math.random() * VH * 0.3,
      w:    5  + Math.random() * 9,
      h:    3  + Math.random() * 5,
      col:  CONFETTI_COLS[Math.floor(Math.random() * CONFETTI_COLS.length)],
      vy:   0.8 + Math.random() * 1.4,
      vx:   (Math.random() - 0.5) * 1.2,
      rot:  Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.12,
      opacity: 0.7 + Math.random() * 0.25,
      shape: Math.random() < 0.4 ? 'circle' : Math.random() < 0.5 ? 'rect' : 'ribbon',
    });

    const confetti = Array.from({ length: 55 }, mkConfetto);

    // ── Sparkles ──────────────────────────────────────────────────────────────
    const mkSparkle = () => ({
      x:     Math.random() * VW,
      y:     Math.random() * VH,
      phase: Math.random() * Math.PI * 2,
      spd:   0.025 + Math.random() * 0.045,
      r:     2 + Math.random() * 4,
      col:   BALLOON_COLS[Math.floor(Math.random() * BALLOON_COLS.length)],
      rays:  4 + Math.floor(Math.random() * 3),  // 4–6 pointed star
    });
    const sparkles = Array.from({ length: 22 }, mkSparkle);

    const drawStar = (x, y, r, rays, alpha, col) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.beginPath();
      for (let i = 0; i < rays * 2; i++) {
        const ang = (i * Math.PI) / rays;
        const rd  = i % 2 === 0 ? r : r * 0.42;
        i === 0 ? ctx.moveTo(Math.cos(ang)*rd, Math.sin(ang)*rd)
                : ctx.lineTo(Math.cos(ang)*rd, Math.sin(ang)*rd);
      }
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      ctx.restore();
    };

    const onResize = () => { VW = window.innerWidth; VH = window.innerHeight; setup(); };
    window.addEventListener('resize', onResize);

    let animId, lastT = null;
    const frame = now => {
      const dt = lastT ? Math.min(now - lastT, 50) : 16; lastT = now;
      const ds = dt / 16;
      ctx.clearRect(0, 0, VW, VH);

      // ── Draw balloons ───────────────────────────────────────────────────
      for (const b of balloons) {
        b.swayPhase += b.swayFreq * ds;
        b.vx = Math.sin(b.swayPhase) * b.swayAmp;
        b.x += b.vx * ds;
        b.y += b.vy * ds;
        if (b.y < -b.r * 2 - b.stringLen) {
          Object.assign(b, mkBalloon());
        }

        ctx.save();
        ctx.globalAlpha = b.opacity;

        // Balloon body
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        const bGrad = ctx.createRadialGradient(
          b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.05,
          b.x, b.y, b.r
        );
        bGrad.addColorStop(0, 'rgba(255,255,255,0.55)');
        bGrad.addColorStop(0.35, b.col + 'dd');
        bGrad.addColorStop(1, b.col + '88');
        ctx.fillStyle = bGrad; ctx.fill();
        // Balloon knot
        ctx.beginPath();
        ctx.arc(b.x, b.y + b.r, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = b.col; ctx.fill();
        // String
        ctx.beginPath();
        ctx.moveTo(b.x, b.y + b.r + 2.5);
        // Curvy string using quadratic
        ctx.quadraticCurveTo(
          b.x + Math.sin(b.swayPhase * 2) * 8,
          b.y + b.r + b.stringLen * 0.55,
          b.x + Math.sin(b.swayPhase) * 5,
          b.y + b.r + b.stringLen
        );
        ctx.strokeStyle = b.col + 'aa';
        ctx.lineWidth = 1.2; ctx.stroke();
        // Shine
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();

        ctx.restore();
      }

      // ── Draw confetti ───────────────────────────────────────────────────
      for (const p of confetti) {
        p.y  += p.vy * ds;
        p.x  += p.vx * ds;
        p.rot += p.rotV * ds;
        p.vx += Math.sin(p.rot * 0.4) * 0.015 * ds;  // gentle lateral drift
        if (p.y > VH + 20) Object.assign(p, mkConfetto());

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.col;

        if (p.shape === 'circle') {
          ctx.beginPath(); ctx.arc(0, 0, p.w * 0.5, 0, Math.PI * 2); ctx.fill();
        } else if (p.shape === 'ribbon') {
          // Thin ribbon — tall and narrow
          ctx.fillRect(-p.h * 0.5, -p.w, p.h, p.w * 2);
        } else {
          ctx.fillRect(-p.w * 0.5, -p.h * 0.5, p.w, p.h);
        }
        ctx.restore();
      }

      // ── Draw sparkles ───────────────────────────────────────────────────
      for (const s of sparkles) {
        s.phase += s.spd * ds;
        const alpha = Math.max(0, Math.sin(s.phase)) * 0.85;
        if (alpha > 0.04) drawStar(s.x, s.y, s.r * (0.6 + 0.4 * Math.sin(s.phase)), s.rays, alpha, s.col);
      }

      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(frame);
    };
    animId = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize); };
  }, []);

  return (
    <canvas ref={canvasRef} style={{
      position:'absolute', top:0, left:0,
      width:'100%', height:'100%',
      pointerEvents:'none', zIndex:0,
    }} />
  );
}

// ─── SUMMER: Hokusai Great Wave background ────────────────────────────────
function HokusaiWaveBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const VW = window.innerWidth, VH = window.innerHeight;
    canvas.width = VW * dpr; canvas.height = VH * dpr;
    canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
    ctx.scale(dpr, dpr);
    let t = 0, animId;

    // Stokes wave: sum of harmonics — realistic ocean wave profile
    // Higher harmonics create the characteristic steep-face / gentle-back asymmetry
    const waveY = (x, layer, time) => {
      const L = [
        { baseY:VH*0.74, amp:VH*0.025, freq:2.4, spd:0.45, ph:0.0 },
        { baseY:VH*0.66, amp:VH*0.045, freq:1.7, spd:0.65, ph:1.3 },
        { baseY:VH*0.56, amp:VH*0.075, freq:1.2, spd:0.85, ph:2.5 },
        { baseY:VH*0.43, amp:VH*0.115, freq:0.85,spd:1.05, ph:0.7 },
      ][layer];
      const k = L.freq * Math.PI * 2 / VW;
      const θ = k * x - L.spd * time + L.ph;
      return L.baseY
        + L.amp * Math.sin(θ)
        + L.amp * 0.28 * Math.sin(2*θ)   // 2nd harmonic — steepens face
        + L.amp * 0.07 * Math.sin(3*θ);  // 3rd harmonic — sharper crest
    };

    const drawSky = () => {
      const g = ctx.createLinearGradient(0, 0, 0, VH * 0.6);
      g.addColorStop(0, '#020b18');
      g.addColorStop(0.45, '#051a3a');
      g.addColorStop(1, '#0a3870');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    };

    const drawFuji = () => {
      // Mt. Fuji — distant, centre-right
      const fx = VW * 0.67, fy = VH * 0.29, fw = VW * 0.2, fh = VH * 0.27;
      // Body gradient
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx - fw*0.5, fy + fh);
      ctx.lineTo(fx + fw*0.5, fy + fh);
      ctx.closePath();
      const bg = ctx.createLinearGradient(fx, fy, fx, fy + fh);
      bg.addColorStop(0, '#08121e');
      bg.addColorStop(0.5, '#0d1e38');
      bg.addColorStop(1, '#0a2248');
      ctx.fillStyle = bg; ctx.fill();
      // Snow cap
      ctx.beginPath();
      ctx.moveTo(fx, fy - 1);
      ctx.lineTo(fx - fw*0.17, fy + fh*0.22);
      ctx.lineTo(fx + fw*0.17, fy + fh*0.22);
      ctx.closePath();
      ctx.fillStyle = '#c5d8ea'; ctx.fill();
      // Fine ridge lines — Hokusai woodblock style
      ctx.strokeStyle = '#1a3060'; ctx.lineWidth = 0.8;
      for (let i = 0; i < 4; i++) {
        const ox = (i - 1.5) * fw * 0.12;
        ctx.beginPath();
        ctx.moveTo(fx + ox*0.3, fy + fh*0.05);
        ctx.lineTo(fx + ox, fy + fh);
        ctx.stroke();
      }
    };

    const drawWave = (layer) => {
      const N = 90;
      const pts = Array.from({ length: N + 1 }, (_, i) => ({
        x: (i / N) * VW,
        y: waveY((i / N) * VW, layer, t),
      }));

      // Wave body — darker at base, brighter at crest
      ctx.beginPath();
      ctx.moveTo(0, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i+1].x) / 2;
        const my = (pts[i].y + pts[i+1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.lineTo(VW, pts[N].y);
      ctx.lineTo(VW, VH); ctx.lineTo(0, VH); ctx.closePath();

      const cols = [
        ['#04101e','#07233a','#082040'],
        ['#07203c','#0a3060','#0d3a70'],
        ['#0a2a50','#123a78','#1a5090'],
        ['#0d3878','#1858b0','#2070d0'],
      ][layer];
      const wg = ctx.createLinearGradient(0, pts.reduce((m,p)=>Math.min(m,p.y),VH) - 30, 0, VH);
      wg.addColorStop(0, cols[2]);
      wg.addColorStop(0.35, cols[1]);
      wg.addColorStop(1, cols[0]);
      ctx.fillStyle = wg; ctx.fill();

      // Surface highlight line
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i+1].x) / 2;
        const my = (pts[i].y + pts[i+1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      const foamAlpha = [0.35, 0.5, 0.65, 0.85][layer];
      ctx.strokeStyle = `rgba(200,230,255,${foamAlpha})`;
      ctx.lineWidth = layer === 3 ? 2 : 1.2;
      ctx.stroke();

      // Hokusai foam crests on front wave
      if (layer === 3) {
        for (let i = 3; i < pts.length - 3; i++) {
          const isCrest = pts[i].y < pts[i-1].y && pts[i].y < pts[i+1].y
                       && pts[i].y < pts[i-2].y && pts[i].y < pts[i+2].y;
          if (!isCrest) continue;
          const cx = pts[i].x, cy = pts[i].y;

          // Glow
          const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
          grd.addColorStop(0, 'rgba(255,255,255,0.9)');
          grd.addColorStop(0.4, 'rgba(210,240,255,0.55)');
          grd.addColorStop(1, 'rgba(150,210,255,0)');
          ctx.beginPath(); ctx.arc(cx, cy - 5, 14, 0, Math.PI*2);
          ctx.fillStyle = grd; ctx.fill();

          // Characteristic claw/curl strokes — the Hokusai signature
          ctx.strokeStyle = 'rgba(230,248,255,0.8)';
          for (let j = -3; j <= 3; j++) {
            const ox = cx + j * 6;
            ctx.beginPath();
            ctx.moveTo(ox, cy + 2);
            ctx.bezierCurveTo(ox + 5, cy - 10, ox + 12, cy - 6, ox + 10, cy + 8);
            ctx.lineWidth = 1.3; ctx.stroke();
          }
          // Foam dots
          for (let j = -5; j <= 5; j++) {
            ctx.beginPath();
            ctx.arc(cx + j*4 + Math.sin(t*2+j)*2, cy - 4 + Math.cos(t+j)*3, 1.5, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(240,252,255,0.85)'; ctx.fill();
          }
        }
      }
    };

    const loop = () => {
      t += 0.016;
      drawSky();
      drawFuji();
      drawWave(0); drawWave(1); drawWave(2); drawWave(3);
      animId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animId);
  }, []);
  return <canvas ref={canvasRef} style={{
    position:'absolute', top:0, left:0,
    width:'100%', height:'100%', pointerEvents:'none', zIndex:0,
  }}/>;
}

// ── WINTER: Snow with gravity + intermittent wind ─────────────────────────
function WinterSnowBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const VW = window.innerWidth, VH = window.innerHeight;
    canvas.width = VW * dpr; canvas.height = VH * dpr;
    canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
    ctx.scale(dpr, dpr);

    // Wind state — changes direction randomly every 3–7s
    let windX = 0, windTarget = 0;
    let windTimer = 0, nextWindChange = 3000 + Math.random() * 4000;
    let lastNow = performance.now();

    // Snowflake particles
    const FLAKES = Array.from({ length: 90 }, () => ({
      x:      Math.random() * VW,
      y:      Math.random() * VH,
      r:      1.4 + Math.random() * 3.6,       // size 1.4–5 px
      vy:     0.4 + Math.random() * 1.4,       // gravity fall speed
      vx:     (Math.random() - 0.5) * 0.4,    // per-flake random drift
      wobble: Math.random() * Math.PI * 2,     // horizontal pendulum phase
      wSpeed: 0.018 + Math.random() * 0.025,  // pendulum speed
      op:     0.45 + Math.random() * 0.55,    // opacity
    }));

    let animId;
    const loop = (now) => {
      const dt = Math.min(now - lastNow, 50);
      lastNow = now;

      // Wind update
      windTimer += dt;
      if (windTimer >= nextWindChange) {
        // New target: calm (0), gentle (<1), strong gust (1–2.5), opposite
        const r = Math.random();
        windTarget = r < 0.25 ? 0
          : r < 0.55 ? (Math.random() - 0.5) * 1.2
          : (Math.random() < 0.5 ? 1 : -1) * (1.5 + Math.random() * 1.2);
        windTimer = 0;
        nextWindChange = 3000 + Math.random() * 4000;
      }
      // Smooth easing toward wind target (inertia)
      windX += (windTarget - windX) * 0.018;

      ctx.clearRect(0, 0, VW, VH);

      FLAKES.forEach(f => {
        // Pendulum wobble (horizontal oscillation)
        f.wobble += f.wSpeed;
        const pendulum = Math.sin(f.wobble) * 0.5;

        // Apply physics: gravity + wind + per-flake drift + pendulum
        f.x += windX + f.vx + pendulum;
        f.y += f.vy;

        // Wrap — exit bottom → re-enter top, exit sides → wrap
        if (f.y > VH + 10) { f.y = -8; f.x = Math.random() * VW; }
        if (f.x > VW + 20) f.x = -20;
        if (f.x < -20)     f.x = VW + 20;

        // Draw: soft white radial dot
        // Light mode: dark slate-blue snow visible on light backgrounds
        const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const sA = isDarkMode ? f.op : Math.min(0.9, f.op * 1.8);
        const sc0 = isDarkMode ? `rgba(255,255,255,${sA})` : `rgba(50,70,110,${sA})`;
        const sc1 = isDarkMode ? `rgba(220,235,255,${sA*0.5})` : `rgba(70,90,130,${sA*0.6})`;
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 1.8);
        g.addColorStop(0, sc0);
        g.addColorStop(0.5, sc1);
        g.addColorStop(1, 'rgba(100,120,160,0)');
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      });

      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);
  return <canvas ref={canvasRef} style={{
    position:'absolute', top:0, left:0,
    width:'100%', height:'100%', pointerEvents:'none', zIndex:0,
  }}/>;
}

function DailyQuoteScreen({ quoteData, loading, onDismiss, seasonOverride }) {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  const [swiping,     setSwiping]     = useState(false);
  const [touchStartY, setTouchStartY] = useState(null);

  const dismiss = () => {
    setSwiping(true);
    setTimeout(onDismiss, 350);
  };

  const handleTouchStart = e => setTouchStartY(e.touches[0].clientY);
  const handleTouchEnd   = e => {
    if (touchStartY !== null &&
        (e.changedTouches[0].clientY - touchStartY) > 60) dismiss();
    setTouchStartY(null);
  };

  const isSpecial     = quoteData?.isSpecial;
  const season        = seasonOverride || getSeason();
  const isAutumn      = season === 'autumn';
  const isSummer      = season === 'summer';
  const isWinter      = season === 'winter';
  const label         = quoteData?.label?.toLowerCase() || '';
  const isBirthday    = label.includes('birthday');
  const isAnniversary = label.includes('anniversary');
  const isMothersDay  = label.includes("mother");
  const isFathersDay  = label.includes("father");
  const isChristmas   = label.includes('christmas')
    || (new Date().getMonth() === 11 && new Date().getDate() === 25);
  const hasSpecialBg  = isBirthday || isAnniversary || isMothersDay || isFathersDay || isChristmas;
  const isOtsukimi    = label.includes('otsukimi') || label.includes('mid-autumn');

  return (
    <div
      onClick={dismiss}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position:'fixed', inset:0, zIndex:200,
        background:`linear-gradient(160deg, ${C.bg} 0%, #F2EDE5 50%, #EDE4D8 100%)`,
        display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        padding:'32px 24px',
        cursor:'pointer',
        animation: swiping ? 'quoteSwipeDown 0.35s ease-in forwards' : 'none',
      }}>
      <style>{SPLASH_PETAL_CSS}</style>

      {/* Special occasion backgrounds — take priority over seasonal */}
      {isOtsukimi    && <OtsukimiBackground />}
      {isChristmas   && <ChristmasBackground />}
      {!isOtsukimi && !isChristmas && isMothersDay  && <MothersDayBackground />}
      {!isOtsukimi && !isChristmas && isFathersDay  && <FathersDayBackground />}
      {!isOtsukimi && !isChristmas && isAnniversary && !isBirthday && <AnniversaryBackground />}
      {!isOtsukimi && !isChristmas && isBirthday    && !isAnniversary && <BirthdayBackground />}
      {/* Seasonal backgrounds — only when no special occasion */}
      {!hasSpecialBg && !isOtsukimi && isSummer && <HotaruOverlay isVisible colorScheme="dark" zIndex={0} />}
      {!hasSpecialBg && !isOtsukimi && isWinter && <WinterSnowBackground />}
      {!hasSpecialBg && !isOtsukimi && isAutumn && <MomijiOverlay isVisible intensity="medium" />}

      {/* Spring petals — suppressed on special occasions, other seasons, and Otsukimi */}
      {(!hasSpecialBg && !isOtsukimi && !isAutumn && !isSummer && !isWinter) && SPLASH_PETALS.map((p, i) => (
        <div key={i} style={{
          position:'absolute', top:0, left:p.left,
          width:p.size, height:p.size,
          borderRadius:'50% 50% 50% 0', background:p.color, opacity:0,
          animationName:p.anim, animationDuration:p.dur,
          animationDelay:p.delay, animationTimingFunction:'ease-in',
          animationIterationCount:'infinite', animationFillMode:'both',
          pointerEvents:'none',
        }} />
      ))}

      {/* Kizuna logo */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
        marginBottom:36, position:'relative', zIndex:1 }}>
        <div style={{ transform:'scale(1.6)', marginBottom:14 }}>
          <SeasonIcon season={season} />
        </div>
        <h1 style={{ margin:0, fontSize:34, fontWeight:700,
          fontFamily:'Cormorant Garamond,serif',
          color:C.text, letterSpacing:'0.02em', lineHeight:1 }}>
          Kizuna&thinsp;<span style={{ color:C.rose }}>絆</span>
        </h1>
        <p style={{ margin:'6px 0 0', fontSize:13, color:C.muted,
          fontStyle:'italic', fontFamily:'Cormorant Garamond,serif',
          letterSpacing:'0.04em' }}>
          Today's Reflection
        </p>
      </div>

      {/* Quote card — matches ECard style */}
      <div onClick={e => e.stopPropagation()} style={{
        width:'100%', maxWidth:380, position:'relative', zIndex:1,
        background:C.card,
        border:`1px solid ${C.border}`,
        borderRadius:BR.card,
        padding:'28px 26px 24px',
        boxShadow:SH.float,
        animation:'quoteCardIn 0.6s ease-out 0.2s both',
      }}>
        {/* Type label */}
        {quoteData?.label && (
          <p style={{ margin:'0 0 14px', fontSize:11, fontWeight:700,
            textTransform:'uppercase', letterSpacing:'0.12em',
            color: isSpecial ? C.rose : C.muted }}>
            {quoteData.label}
          </p>
        )}

        {/* Colour stripe — matches entry cards */}
        <div style={{ width:4, height:36, borderRadius:2, background:C.rose,
          position:'absolute', left:0, top:28, borderTopRightRadius:2,
          borderBottomRightRadius:2 }} />

        {/* Quote text or shimmer */}
        {loading ? (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[100, 85, 70].map((w, i) => (
              <div key={i} style={{
                height:13, width:`${w}%`, borderRadius:7,
                background:`linear-gradient(90deg, ${C.elevated} 25%, ${C.border} 50%, ${C.elevated} 75%)`,
                backgroundSize:'400px 100%',
                animation:'shimmer 1.4s infinite linear',
                animationDelay:`${i*0.15}s`,
              }} />
            ))}
          </div>
        ) : (
          <p style={{
            margin:0, fontSize:19, lineHeight:1.8,
            fontFamily:'Cormorant Garamond,serif',
            fontStyle:'italic', fontWeight:400,
            color:C.text, letterSpacing:'0.01em',
          }}>
            "{quoteData?.quote}"
          </p>
        )}

        {/* Dismiss button */}
        {!loading && (
          <button
            onClick={e => { e.stopPropagation(); dismiss(); }}
            style={{
              marginTop:22, width:'100%',
              background:`linear-gradient(135deg,${C.rose},${C.roseL})`,
              border:`1.5px solid ${C.rose}`,
              borderRadius:BR.btn, padding:'12px',
              fontSize:14, fontWeight:700,
              color:'#fff', cursor:'pointer',
              fontFamily:'inherit', transition:'all 0.3s',
              boxShadow:`0 4px 14px ${C.rose}40`,
            }}>
            Enter Kizuna 🌸
          </button>
        )}
      </div>

      {/* Tap hint */}
      {!loading && (
        <p style={{ marginTop:16, fontSize:12, color:C.muted,
          position:'relative', zIndex:1, fontStyle:'italic' }}>
          tap anywhere or swipe down to continue
        </p>
      )}
    </div>
  );
}

// ─── PUBLIC HOLIDAYS ─────────────────────────────────────────────
// Singapore (SG) and Japan (JP) national bank holidays 2026–2035.
// Hardcoded from official sources — no external API needed.
const PUBLIC_HOLIDAYS = [
  // 2026 — Mother's Day & Father's Day
  {date:'2026-05-10',name:"Mother's Day",country:'SG'},{date:'2026-05-10',name:"Mother's Day",country:'JP'},
  {date:'2026-06-21',name:"Father's Day",country:'SG'},{date:'2026-06-21',name:"Father's Day",country:'JP'},
  {date:'2027-05-09',name:"Mother's Day",country:'SG'},{date:'2027-05-09',name:"Mother's Day",country:'JP'},
  {date:'2027-06-20',name:"Father's Day",country:'SG'},{date:'2027-06-20',name:"Father's Day",country:'JP'},
  {date:'2028-05-14',name:"Mother's Day",country:'SG'},{date:'2028-05-14',name:"Mother's Day",country:'JP'},
  {date:'2028-06-18',name:"Father's Day",country:'SG'},{date:'2028-06-18',name:"Father's Day",country:'JP'},
  {date:'2029-05-13',name:"Mother's Day",country:'SG'},{date:'2029-05-13',name:"Mother's Day",country:'JP'},
  {date:'2029-06-17',name:"Father's Day",country:'SG'},{date:'2029-06-17',name:"Father's Day",country:'JP'},
  {date:'2030-05-12',name:"Mother's Day",country:'SG'},{date:'2030-05-12',name:"Mother's Day",country:'JP'},
  {date:'2030-06-16',name:"Father's Day",country:'SG'},{date:'2030-06-16',name:"Father's Day",country:'JP'},
  {date:'2031-05-11',name:"Mother's Day",country:'SG'},{date:'2031-05-11',name:"Mother's Day",country:'JP'},
  {date:'2031-06-15',name:"Father's Day",country:'SG'},{date:'2031-06-15',name:"Father's Day",country:'JP'},
  {date:'2032-05-09',name:"Mother's Day",country:'SG'},{date:'2032-05-09',name:"Mother's Day",country:'JP'},
  {date:'2032-06-20',name:"Father's Day",country:'SG'},{date:'2032-06-20',name:"Father's Day",country:'JP'},
  {date:'2033-05-08',name:"Mother's Day",country:'SG'},{date:'2033-05-08',name:"Mother's Day",country:'JP'},
  {date:'2033-06-19',name:"Father's Day",country:'SG'},{date:'2033-06-19',name:"Father's Day",country:'JP'},
  {date:'2034-05-14',name:"Mother's Day",country:'SG'},{date:'2034-05-14',name:"Mother's Day",country:'JP'},
  {date:'2034-06-18',name:"Father's Day",country:'SG'},{date:'2034-06-18',name:"Father's Day",country:'JP'},
  {date:'2035-05-13',name:"Mother's Day",country:'SG'},{date:'2035-05-13',name:"Mother's Day",country:'JP'},
  {date:'2035-06-17',name:"Father's Day",country:'SG'},{date:'2035-06-17',name:"Father's Day",country:'JP'},
  // 2026
  {date:'2026-01-01',name:"New Year's Day",country:'SG'},{date:'2026-01-01',name:"New Year's Day",country:'JP'},
  {date:'2026-01-12',name:'Coming of Age Day',country:'JP'},{date:'2026-02-11',name:'National Foundation Day',country:'JP'},
  {date:'2026-02-17',name:'Chinese New Year',country:'SG'},{date:'2026-02-18',name:'Chinese New Year',country:'SG'},
  {date:'2026-02-23',name:"Emperor's Birthday",country:'JP'},{date:'2026-03-20',name:'Spring Equinox',country:'JP'},
  {date:'2026-03-30',name:'Hari Raya Puasa',country:'SG'},{date:'2026-04-03',name:'Good Friday',country:'SG'},
  {date:'2026-04-29',name:'Showa Day',country:'JP'},{date:'2026-05-01',name:'Labour Day',country:'SG'},
  {date:'2026-05-03',name:'Constitution Memorial Day',country:'JP'},{date:'2026-05-04',name:'Greenery Day',country:'JP'},
  {date:'2026-05-05',name:"Children's Day",country:'JP'},{date:'2026-05-12',name:'Vesak Day',country:'SG'},
  {date:'2026-06-06',name:'Hari Raya Haji',country:'SG'},{date:'2026-07-20',name:'Marine Day',country:'JP'},
  {date:'2026-08-09',name:'National Day',country:'SG'},{date:'2026-08-11',name:'Mountain Day',country:'JP'},
  {date:'2026-09-21',name:'Respect for the Aged Day',country:'JP'},{date:'2026-09-23',name:'Autumnal Equinox',country:'JP'},
  {date:'2026-10-12',name:'Sports Day',country:'JP'},{date:'2026-10-20',name:'Deepavali',country:'SG'},
  {date:'2026-11-03',name:'Culture Day',country:'JP'},{date:'2026-11-23',name:'Labour Thanksgiving Day',country:'JP'},
  {date:'2026-12-25',name:'Christmas Day',country:'SG'},
  // 2027
  {date:'2027-01-01',name:"New Year's Day",country:'SG'},{date:'2027-01-01',name:"New Year's Day",country:'JP'},
  {date:'2027-01-11',name:'Coming of Age Day',country:'JP'},{date:'2027-02-06',name:'Chinese New Year',country:'SG'},
  {date:'2027-02-07',name:'Chinese New Year',country:'SG'},{date:'2027-02-11',name:'National Foundation Day',country:'JP'},
  {date:'2027-02-23',name:"Emperor's Birthday",country:'JP'},{date:'2027-03-20',name:'Hari Raya Puasa',country:'SG'},
  {date:'2027-03-21',name:'Spring Equinox',country:'JP'},{date:'2027-03-26',name:'Good Friday',country:'SG'},
  {date:'2027-04-29',name:'Showa Day',country:'JP'},{date:'2027-05-01',name:'Labour Day',country:'SG'},
  {date:'2027-05-03',name:'Constitution Memorial Day',country:'JP'},{date:'2027-05-04',name:'Greenery Day',country:'JP'},
  {date:'2027-05-05',name:"Children's Day",country:'JP'},{date:'2027-05-27',name:'Hari Raya Haji',country:'SG'},
  {date:'2027-05-31',name:'Vesak Day',country:'SG'},{date:'2027-07-19',name:'Marine Day',country:'JP'},
  {date:'2027-08-09',name:'National Day',country:'SG'},{date:'2027-08-11',name:'Mountain Day',country:'JP'},
  {date:'2027-09-20',name:'Respect for the Aged Day',country:'JP'},{date:'2027-09-23',name:'Autumnal Equinox',country:'JP'},
  {date:'2027-10-11',name:'Sports Day',country:'JP'},{date:'2027-11-03',name:'Culture Day',country:'JP'},
  {date:'2027-11-08',name:'Deepavali',country:'SG'},{date:'2027-11-23',name:'Labour Thanksgiving Day',country:'JP'},
  {date:'2027-12-25',name:'Christmas Day',country:'SG'},
  // 2028
  {date:'2028-01-01',name:"New Year's Day",country:'SG'},{date:'2028-01-01',name:"New Year's Day",country:'JP'},
  {date:'2028-01-10',name:'Coming of Age Day',country:'JP'},{date:'2028-01-24',name:'Hari Raya Puasa',country:'SG'},
  {date:'2028-01-26',name:'Chinese New Year',country:'SG'},{date:'2028-01-27',name:'Chinese New Year',country:'SG'},
  {date:'2028-02-11',name:'National Foundation Day',country:'JP'},{date:'2028-02-23',name:"Emperor's Birthday",country:'JP'},
  {date:'2028-03-09',name:'Hari Raya Puasa',country:'SG'},{date:'2028-03-20',name:'Spring Equinox',country:'JP'},
  {date:'2028-04-14',name:'Good Friday',country:'SG'},{date:'2028-04-29',name:'Showa Day',country:'JP'},
  {date:'2028-05-01',name:'Labour Day',country:'SG'},{date:'2028-05-03',name:'Constitution Memorial Day',country:'JP'},
  {date:'2028-05-04',name:'Greenery Day',country:'JP'},{date:'2028-05-05',name:"Children's Day",country:'JP'},
  {date:'2028-05-16',name:'Hari Raya Haji',country:'SG'},{date:'2028-05-20',name:'Vesak Day',country:'SG'},
  {date:'2028-07-17',name:'Marine Day',country:'JP'},{date:'2028-08-09',name:'National Day',country:'SG'},
  {date:'2028-08-11',name:'Mountain Day',country:'JP'},{date:'2028-09-18',name:'Respect for the Aged Day',country:'JP'},
  {date:'2028-09-22',name:'Autumnal Equinox',country:'JP'},{date:'2028-10-09',name:'Sports Day',country:'JP'},
  {date:'2028-10-26',name:'Deepavali',country:'SG'},{date:'2028-11-03',name:'Culture Day',country:'JP'},
  {date:'2028-11-23',name:'Labour Thanksgiving Day',country:'JP'},{date:'2028-12-25',name:'Christmas Day',country:'SG'},
  // 2029
  {date:'2029-01-01',name:"New Year's Day",country:'SG'},{date:'2029-01-01',name:"New Year's Day",country:'JP'},
  {date:'2029-01-08',name:'Coming of Age Day',country:'JP'},{date:'2029-02-11',name:'National Foundation Day',country:'JP'},
  {date:'2029-02-13',name:'Chinese New Year',country:'SG'},{date:'2029-02-14',name:'Chinese New Year',country:'SG'},
  {date:'2029-02-23',name:"Emperor's Birthday",country:'JP'},{date:'2029-02-26',name:'Hari Raya Puasa',country:'SG'},
  {date:'2029-03-20',name:'Spring Equinox',country:'JP'},{date:'2029-03-30',name:'Good Friday',country:'SG'},
  {date:'2029-04-29',name:'Showa Day',country:'JP'},{date:'2029-05-01',name:'Labour Day',country:'SG'},
  {date:'2029-05-03',name:'Constitution Memorial Day',country:'JP'},{date:'2029-05-04',name:'Greenery Day',country:'JP'},
  {date:'2029-05-05',name:'Hari Raya Haji',country:'SG'},{date:'2029-05-05',name:"Children's Day",country:'JP'},
  {date:'2029-05-08',name:'Vesak Day',country:'SG'},{date:'2029-07-16',name:'Marine Day',country:'JP'},
  {date:'2029-08-09',name:'National Day',country:'SG'},{date:'2029-08-11',name:'Mountain Day',country:'JP'},
  {date:'2029-09-17',name:'Respect for the Aged Day',country:'JP'},{date:'2029-09-23',name:'Autumnal Equinox',country:'JP'},
  {date:'2029-10-08',name:'Sports Day',country:'JP'},{date:'2029-11-03',name:'Culture Day',country:'JP'},
  {date:'2029-11-14',name:'Deepavali',country:'SG'},{date:'2029-11-23',name:'Labour Thanksgiving Day',country:'JP'},
  {date:'2029-12-25',name:'Christmas Day',country:'SG'},
  // 2030
  {date:'2030-01-01',name:"New Year's Day",country:'SG'},{date:'2030-01-01',name:"New Year's Day",country:'JP'},
  {date:'2030-01-14',name:'Coming of Age Day',country:'JP'},{date:'2030-02-03',name:'Chinese New Year',country:'SG'},
  {date:'2030-02-04',name:'Chinese New Year',country:'SG'},{date:'2030-02-11',name:'National Foundation Day',country:'JP'},
  {date:'2030-02-15',name:'Hari Raya Puasa',country:'SG'},{date:'2030-02-23',name:"Emperor's Birthday",country:'JP'},
  {date:'2030-03-20',name:'Spring Equinox',country:'JP'},{date:'2030-04-19',name:'Good Friday',country:'SG'},
  {date:'2030-04-24',name:'Hari Raya Haji',country:'SG'},{date:'2030-04-29',name:'Showa Day',country:'JP'},
  {date:'2030-05-01',name:'Labour Day',country:'SG'},{date:'2030-05-03',name:'Constitution Memorial Day',country:'JP'},
  {date:'2030-05-04',name:'Greenery Day',country:'JP'},{date:'2030-05-05',name:"Children's Day",country:'JP'},
  {date:'2030-05-15',name:'Marine Day',country:'JP'},{date:'2030-05-26',name:'Vesak Day',country:'SG'},
  {date:'2030-08-09',name:'National Day',country:'SG'},{date:'2030-08-11',name:'Mountain Day',country:'JP'},
  {date:'2030-09-16',name:'Respect for the Aged Day',country:'JP'},{date:'2030-09-23',name:'Autumnal Equinox',country:'JP'},
  {date:'2030-10-14',name:'Sports Day',country:'JP'},{date:'2030-11-03',name:'Culture Day',country:'JP'},
  {date:'2030-11-03',name:'Deepavali',country:'SG'},{date:'2030-11-23',name:'Labour Thanksgiving Day',country:'JP'},
  {date:'2030-12-25',name:'Christmas Day',country:'SG'},
  // 2031
  {date:'2031-01-01',name:"New Year's Day",country:'SG'},{date:'2031-01-01',name:"New Year's Day",country:'JP'},
  {date:'2031-01-13',name:'Coming of Age Day',country:'JP'},{date:'2031-01-23',name:'Chinese New Year',country:'SG'},
  {date:'2031-01-24',name:'Chinese New Year',country:'SG'},{date:'2031-02-04',name:'Hari Raya Puasa',country:'SG'},
  {date:'2031-02-11',name:'National Foundation Day',country:'JP'},{date:'2031-02-23',name:"Emperor's Birthday",country:'JP'},
  {date:'2031-03-21',name:'Spring Equinox',country:'JP'},{date:'2031-04-11',name:'Good Friday',country:'SG'},
  {date:'2031-04-13',name:'Hari Raya Haji',country:'SG'},{date:'2031-04-29',name:'Showa Day',country:'JP'},
  {date:'2031-05-01',name:'Labour Day',country:'SG'},{date:'2031-05-03',name:'Constitution Memorial Day',country:'JP'},
  {date:'2031-05-04',name:'Greenery Day',country:'JP'},{date:'2031-05-05',name:"Children's Day",country:'JP'},
  {date:'2031-05-15',name:'Vesak Day',country:'SG'},{date:'2031-07-21',name:'Marine Day',country:'JP'},
  {date:'2031-08-09',name:'National Day',country:'SG'},{date:'2031-08-11',name:'Mountain Day',country:'JP'},
  {date:'2031-09-15',name:'Respect for the Aged Day',country:'JP'},{date:'2031-09-23',name:'Autumnal Equinox',country:'JP'},
  {date:'2031-10-13',name:'Sports Day',country:'JP'},{date:'2031-10-23',name:'Deepavali',country:'SG'},
  {date:'2031-11-03',name:'Culture Day',country:'JP'},{date:'2031-11-23',name:'Labour Thanksgiving Day',country:'JP'},
  {date:'2031-12-25',name:'Christmas Day',country:'SG'},
  // 2032
  {date:'2032-01-01',name:"New Year's Day",country:'SG'},{date:'2032-01-01',name:"New Year's Day",country:'JP'},
  {date:'2032-01-12',name:'Coming of Age Day',country:'JP'},{date:'2032-01-24',name:'Hari Raya Puasa',country:'SG'},
  {date:'2032-02-11',name:'Chinese New Year',country:'SG'},{date:'2032-02-11',name:'National Foundation Day',country:'JP'},
  {date:'2032-02-12',name:'Chinese New Year',country:'SG'},{date:'2032-02-23',name:"Emperor's Birthday",country:'JP'},
  {date:'2032-03-20',name:'Spring Equinox',country:'JP'},{date:'2032-03-26',name:'Good Friday',country:'SG'},
  {date:'2032-04-01',name:'Hari Raya Haji',country:'SG'},{date:'2032-04-29',name:'Showa Day',country:'JP'},
  {date:'2032-05-01',name:'Labour Day',country:'SG'},{date:'2032-05-03',name:'Constitution Memorial Day',country:'JP'},
  {date:'2032-05-03',name:'Vesak Day',country:'SG'},{date:'2032-05-04',name:'Greenery Day',country:'JP'},
  {date:'2032-05-05',name:"Children's Day",country:'JP'},{date:'2032-07-19',name:'Marine Day',country:'JP'},
  {date:'2032-08-09',name:'National Day',country:'SG'},{date:'2032-08-11',name:'Mountain Day',country:'JP'},
  {date:'2032-09-20',name:'Respect for the Aged Day',country:'JP'},{date:'2032-09-22',name:'Autumnal Equinox',country:'JP'},
  {date:'2032-10-11',name:'Sports Day',country:'JP'},{date:'2032-11-03',name:'Culture Day',country:'JP'},
  {date:'2032-11-10',name:'Deepavali',country:'SG'},{date:'2032-11-23',name:'Labour Thanksgiving Day',country:'JP'},
  {date:'2032-12-25',name:'Christmas Day',country:'SG'},
  // 2033
  {date:'2033-01-01',name:"New Year's Day",country:'SG'},{date:'2033-01-01',name:"New Year's Day",country:'JP'},
  {date:'2033-01-10',name:'Coming of Age Day',country:'JP'},{date:'2033-01-12',name:'Hari Raya Puasa',country:'SG'},
  {date:'2033-01-31',name:'Chinese New Year',country:'SG'},{date:'2033-02-01',name:'Chinese New Year',country:'SG'},
  {date:'2033-02-11',name:'National Foundation Day',country:'JP'},{date:'2033-02-23',name:"Emperor's Birthday",country:'JP'},
  {date:'2033-03-20',name:'Spring Equinox',country:'JP'},{date:'2033-03-21',name:'Hari Raya Haji',country:'SG'},
  {date:'2033-04-15',name:'Good Friday',country:'SG'},{date:'2033-04-29',name:'Showa Day',country:'JP'},
  {date:'2033-05-01',name:'Labour Day',country:'SG'},{date:'2033-05-03',name:'Constitution Memorial Day',country:'JP'},
  {date:'2033-05-04',name:'Greenery Day',country:'JP'},{date:'2033-05-05',name:"Children's Day",country:'JP'},
  {date:'2033-05-22',name:'Vesak Day',country:'SG'},{date:'2033-07-18',name:'Marine Day',country:'JP'},
  {date:'2033-08-09',name:'National Day',country:'SG'},{date:'2033-08-11',name:'Mountain Day',country:'JP'},
  {date:'2033-09-19',name:'Respect for the Aged Day',country:'JP'},{date:'2033-09-23',name:'Autumnal Equinox',country:'JP'},
  {date:'2033-10-10',name:'Sports Day',country:'JP'},{date:'2033-10-30',name:'Deepavali',country:'SG'},
  {date:'2033-11-03',name:'Culture Day',country:'JP'},{date:'2033-11-23',name:'Labour Thanksgiving Day',country:'JP'},
  {date:'2033-12-25',name:'Christmas Day',country:'SG'},
  // 2034
  {date:'2034-01-01',name:"New Year's Day",country:'SG'},{date:'2034-01-01',name:"New Year's Day",country:'JP'},
  {date:'2034-01-01',name:'Hari Raya Puasa',country:'SG'},{date:'2034-01-09',name:'Coming of Age Day',country:'JP'},
  {date:'2034-02-11',name:'National Foundation Day',country:'JP'},{date:'2034-02-19',name:'Chinese New Year',country:'SG'},
  {date:'2034-02-20',name:'Chinese New Year',country:'SG'},{date:'2034-02-23',name:"Emperor's Birthday",country:'JP'},
  {date:'2034-03-10',name:'Hari Raya Haji',country:'SG'},{date:'2034-03-21',name:'Spring Equinox',country:'JP'},
  {date:'2034-03-31',name:'Good Friday',country:'SG'},{date:'2034-04-29',name:'Showa Day',country:'JP'},
  {date:'2034-05-01',name:'Labour Day',country:'SG'},{date:'2034-05-03',name:'Constitution Memorial Day',country:'JP'},
  {date:'2034-05-04',name:'Greenery Day',country:'JP'},{date:'2034-05-05',name:"Children's Day",country:'JP'},
  {date:'2034-05-11',name:'Vesak Day',country:'SG'},{date:'2034-07-17',name:'Marine Day',country:'JP'},
  {date:'2034-08-09',name:'National Day',country:'SG'},{date:'2034-08-11',name:'Mountain Day',country:'JP'},
  {date:'2034-09-18',name:'Respect for the Aged Day',country:'JP'},{date:'2034-09-23',name:'Autumnal Equinox',country:'JP'},
  {date:'2034-10-09',name:'Sports Day',country:'JP'},{date:'2034-11-03',name:'Culture Day',country:'JP'},
  {date:'2034-11-18',name:'Deepavali',country:'SG'},{date:'2034-11-23',name:'Labour Thanksgiving Day',country:'JP'},
  {date:'2034-12-25',name:'Christmas Day',country:'SG'},
  // 2035
  {date:'2035-01-01',name:"New Year's Day",country:'SG'},{date:'2035-01-01',name:"New Year's Day",country:'JP'},
  {date:'2035-01-08',name:'Coming of Age Day',country:'JP'},{date:'2035-02-08',name:'Chinese New Year',country:'SG'},
  {date:'2035-02-09',name:'Chinese New Year',country:'SG'},{date:'2035-02-11',name:'National Foundation Day',country:'JP'},
  {date:'2035-02-23',name:"Emperor's Birthday",country:'JP'},{date:'2035-02-28',name:'Hari Raya Haji',country:'SG'},
  {date:'2035-03-20',name:'Spring Equinox',country:'JP'},{date:'2035-04-20',name:'Good Friday',country:'SG'},
  {date:'2035-04-29',name:'Showa Day',country:'JP'},{date:'2035-05-01',name:'Labour Day',country:'SG'},
  {date:'2035-05-03',name:'Constitution Memorial Day',country:'JP'},{date:'2035-05-04',name:'Greenery Day',country:'JP'},
  {date:'2035-05-05',name:"Children's Day",country:'JP'},{date:'2035-05-30',name:'Vesak Day',country:'SG'},
  {date:'2035-07-16',name:'Marine Day',country:'JP'},{date:'2035-08-09',name:'National Day',country:'SG'},
  {date:'2035-08-11',name:'Mountain Day',country:'JP'},{date:'2035-09-17',name:'Respect for the Aged Day',country:'JP'},
  {date:'2035-09-23',name:'Autumnal Equinox',country:'JP'},{date:'2035-10-08',name:'Sports Day',country:'JP'},
  {date:'2035-11-03',name:'Culture Day',country:'JP'},{date:'2035-11-07',name:'Deepavali',country:'SG'},
  {date:'2035-11-23',name:'Labour Thanksgiving Day',country:'JP'},{date:'2035-12-21',name:'Hari Raya Puasa',country:'SG'},
  {date:'2035-12-25',name:'Christmas Day',country:'SG'},

  // France — Jours fériés 2026–2030
  // Fixed public holidays (same date every year)
  {date:'2026-01-01',name:"Jour de l'An",country:'FR'},
  {date:'2026-05-01',name:'Fête du Travail',country:'FR'},
  {date:'2026-05-08',name:'Victoire 1945',country:'FR'},
  {date:'2026-07-14',name:'Fête Nationale',country:'FR'},
  {date:'2026-08-15',name:'Assomption',country:'FR'},
  {date:'2026-11-01',name:'Toussaint',country:'FR'},
  {date:'2026-11-11',name:'Armistice',country:'FR'},
  {date:'2026-12-25',name:'Noël',country:'FR'},
  // Variable 2026 (Easter Apr 5)
  {date:'2026-04-06',name:'Lundi de Pâques',country:'FR'},
  {date:'2026-05-14',name:'Ascension',country:'FR'},
  {date:'2026-05-25',name:'Lundi de Pentecôte',country:'FR'},
  // 2027
  {date:'2027-01-01',name:"Jour de l'An",country:'FR'},
  {date:'2027-05-01',name:'Fête du Travail',country:'FR'},
  {date:'2027-05-08',name:'Victoire 1945',country:'FR'},
  {date:'2027-07-14',name:'Fête Nationale',country:'FR'},
  {date:'2027-08-15',name:'Assomption',country:'FR'},
  {date:'2027-11-01',name:'Toussaint',country:'FR'},
  {date:'2027-11-11',name:'Armistice',country:'FR'},
  {date:'2027-12-25',name:'Noël',country:'FR'},
  // Variable 2027 (Easter Mar 28)
  {date:'2027-03-29',name:'Lundi de Pâques',country:'FR'},
  {date:'2027-05-06',name:'Ascension',country:'FR'},
  {date:'2027-05-17',name:'Lundi de Pentecôte',country:'FR'},
  // 2028
  {date:'2028-01-01',name:"Jour de l'An",country:'FR'},
  {date:'2028-05-01',name:'Fête du Travail',country:'FR'},
  {date:'2028-05-08',name:'Victoire 1945',country:'FR'},
  {date:'2028-07-14',name:'Fête Nationale',country:'FR'},
  {date:'2028-08-15',name:'Assomption',country:'FR'},
  {date:'2028-11-01',name:'Toussaint',country:'FR'},
  {date:'2028-11-11',name:'Armistice',country:'FR'},
  {date:'2028-12-25',name:'Noël',country:'FR'},
  // Variable 2028 (Easter Apr 16)
  {date:'2028-04-17',name:'Lundi de Pâques',country:'FR'},
  {date:'2028-05-25',name:'Ascension',country:'FR'},
  {date:'2028-06-05',name:'Lundi de Pentecôte',country:'FR'},
  // 2029
  {date:'2029-01-01',name:"Jour de l'An",country:'FR'},
  {date:'2029-05-01',name:'Fête du Travail',country:'FR'},
  {date:'2029-05-08',name:'Victoire 1945',country:'FR'},
  {date:'2029-07-14',name:'Fête Nationale',country:'FR'},
  {date:'2029-08-15',name:'Assomption',country:'FR'},
  {date:'2029-11-01',name:'Toussaint',country:'FR'},
  {date:'2029-11-11',name:'Armistice',country:'FR'},
  {date:'2029-12-25',name:'Noël',country:'FR'},
  // Variable 2029 (Easter Apr 1)
  {date:'2029-04-02',name:'Lundi de Pâques',country:'FR'},
  {date:'2029-05-10',name:'Ascension',country:'FR'},
  {date:'2029-05-21',name:'Lundi de Pentecôte',country:'FR'},
  // 2030
  {date:'2030-01-01',name:"Jour de l'An",country:'FR'},
  {date:'2030-05-01',name:'Fête du Travail',country:'FR'},
  {date:'2030-05-08',name:'Victoire 1945',country:'FR'},
  {date:'2030-07-14',name:'Fête Nationale',country:'FR'},
  {date:'2030-08-15',name:'Assomption',country:'FR'},
  {date:'2030-11-01',name:'Toussaint',country:'FR'},
  {date:'2030-11-11',name:'Armistice',country:'FR'},
  {date:'2030-12-25',name:'Noël',country:'FR'},
  // Variable 2030 (Easter Apr 21)
  {date:'2030-04-22',name:'Lundi de Pâques',country:'FR'},
  {date:'2030-05-30',name:'Ascension',country:'FR'},
  {date:'2030-06-10',name:'Lundi de Pentecôte',country:'FR'},
];

// Fast lookup by date
const HOLIDAYS_BY_DATE = PUBLIC_HOLIDAYS.reduce((acc, h) => {
  if (!acc[h.date]) acc[h.date] = [];
  acc[h.date].push(h);
  return acc;
}, {});

// Country colours for holiday badges
const HC = { SG:'#EF3340', JP:'#BC002D', FR:'#0055A4' }; // SG red, JP red, FR blue
const HC_LIGHT = { SG:'#FEE8EA', JP:'#FBE8E8', FR:'#E8EFF8' };

// ─── HOLIDAY WRITEUPS ─────────────────────────────────────────────
// Short, interesting history/origin for each SG and JP public holiday.
const HOLIDAY_INFO = {
  // ── Singapore ─────────────────────────────────────────────────
  "New Year's Day": {
    country:'SG',
    text: "Singapore adopted January 1st as a public holiday when it joined the British Commonwealth. The midnight countdown at Marina Bay has grown into one of Asia's most spectacular fireworks displays, drawing over 100,000 revellers annually."
  },
  "Chinese New Year": {
    country:'SG',
    text: "Rooted in ancient Chinese legend, Chinese New Year wards off a mythical beast called Nian with red lanterns and loud firecrackers. Singapore uniquely celebrates two full days of public holiday — one of only a handful of countries to do so — reflecting its 74% Chinese population."
  },
  "Good Friday": {
    country:'SG',
    text: "Good Friday commemorates the crucifixion of Jesus Christ. Singapore retained it as a public holiday from its colonial era. Catholics carry out the traditional Stations of the Cross procession at Saint Joseph's Church in Victoria Street, drawing thousands."
  },
  "Labour Day": {
    country:'SG',
    text: "Celebrated globally since 1886 after the Chicago Haymarket affair, Singapore adopted May Day in 1961. The National Trades Union Congress rally at the Padang was a fixture for decades — today the day marks workers' rights with awards, speeches, and a national holiday."
  },
  "Hari Raya Puasa": {
    country:'SG',
    text: "Known as Eid al-Fitr globally, Hari Raya Puasa ('Festival of Breaking Fast') marks the end of Ramadan — 30 days of dawn-to-dusk fasting. Geylang Serai transforms into a nightly bazaar for weeks before, filled with traditional Malay kueh, batik, and lanterns."
  },
  "Hari Raya Haji": {
    country:'SG',
    text: "Eid al-Adha commemorates Ibrahim's willingness to sacrifice his son in obedience to God. Muslims who perform the Haj pilgrimage to Mecca time it to this day. In Singapore, prayers at mosques are followed by the korban — the ritual slaughter and distribution of meat to those in need."
  },
  "Vesak Day": {
    country:'SG',
    text: "Vesak honours the birth, enlightenment, and passing of the Buddha — all said to have occurred on the same day in different years. Singapore's Buddhist community releases caged birds and lanterns, and temples distribute free vegetarian food to thousands of visitors."
  },
  "National Day": {
    country:'SG',
    text: "On August 9, 1965, Singapore was unexpectedly separated from Malaysia, with founding Prime Minister Lee Kuan Yew famously weeping as he announced independence. The annual NDP parade — featuring Red Lions skydivers, fighter jet flypasts, and fireworks — remains Singapore's most watched event."
  },
  "Deepavali": {
    country:'SG',
    text: "The Festival of Lights celebrates the triumph of light over darkness, good over evil. Little India is transformed with hundreds of thousands of fairy lights weeks before the event. Hindus light oil lamps called diyas at home, exchange sweets, and wear new clothes to signal fresh beginnings."
  },
  "Christmas Day": {
    country:'SG',
    text: "Singapore's Christmas is famously a spectacle of commercialism and community. Orchard Road's Christmas light-up draws millions — Singapore was one of the first Asian cities to adopt the tradition in the 1980s. Despite Christians being only 18% of the population, Christmas is beloved by all faiths."
  },
  "Mother's Day": {
    country:'SG',
    text: "First celebrated in 1908 when Anna Jarvis held a memorial for her mother in West Virginia, Mother's Day became a US national holiday in 1914. In Singapore and Japan, children honour their mothers with flowers — carnations are the traditional symbol, white for those who have passed, red for the living."
  },
  "Father's Day": {
    country:'SG',
    text: "Father's Day was inspired by Mother's Day and first celebrated in 1910 in Washington State. Sonora Smart Dodd wanted to honour her father who raised six children alone after his wife died. The third Sunday of June became the official US date in 1972 — now celebrated across Singapore, Japan, and over 100 countries."
  },
  "New Year's Day (Japan)": {
    country:'JP',
    text: "O-shōgatsu is Japan's most important holiday — families gather for three days, temples ring their bells 108 times at midnight (joya no kane), and 80 million Japanese mail New Year cards (nengajō) that arrive on January 1st by special postal arrangement."
  },
  "Coming of Age Day": {
    country:'JP',
    text: "Seijin no Hi celebrates those who turned 20 (now 18 after 2022 reform) in the past year. Young people dress in elaborate furisode kimono or hakama and attend municipal ceremonies. The holiday dates to 646 AD when a young prince put on new robes to mark adulthood."
  },
  "National Foundation Day": {
    country:'JP',
    text: "Kenkoku Kinen no Hi marks the legendary founding of Japan in 660 BC by Emperor Jimmu, who is said to have descended from the sun goddess Amaterasu. Abolished after WWII for militarist associations, it was quietly revived in 1966 without official mythology references."
  },
  "Emperor's Birthday": {
    country:'JP',
    text: "Tennō Tanjōbi is the only holiday that changes with each new emperor. Emperor Naruhito's birthday on February 23rd replaced the previous February 23rd after his 2019 accession. The public is invited to enter the Imperial Palace — one of only two days per year the grounds open."
  },
  "Spring Equinox": {
    country:'JP',
    text: "Shunbun no Hi, the vernal equinox, has deep Buddhist roots — the equinox is believed to be when the spiritual world (higan, 'other shore') is closest to the living world. Families visit and clean ancestral graves, and many temples hold special ceremonies."
  },
  "Showa Day": {
    country:'JP',
    text: "Shōwa no Hi honours Emperor Hirohito, who reigned during Japan's most turbulent century — WWI, WWII, the atomic bombings, and the postwar economic miracle. The day encourages reflection on Japan's 63-year Shōwa era. It was added to the calendar only in 2007."
  },
  "Constitution Memorial Day": {
    country:'JP',
    text: "Kenpō Kinenbi marks the date Japan's post-WWII constitution came into force on May 3, 1947. Drafted under US occupation, it contains Article 9 — Japan's famous war-renunciation clause — making it one of the world's most distinctive constitutional documents."
  },
  "Greenery Day": {
    country:'JP',
    text: "Midori no Hi originally honoured Emperor Hirohito's love of plants and nature. When Showa Day was created in 2007, Greenery Day moved to May 4th. Japan plants millions of trees annually in its honour — a nation that covers 68% forest, among the highest ratios in the world."
  },
  "Children's Day": {
    country:'JP',
    text: "Kodomo no Hi was originally Tango no Sekku — a samurai festival marking boys' maturity with warrior dolls and iris leaves (believed to ward off evil). In 1948 it was renamed Children's Day, honouring all children. Families fly koinobori carp streamers — one per child — outside their homes."
  },
  "Marine Day": {
    country:'JP',
    text: "Umi no Hi celebrates Japan's deep relationship with the sea. It was established in 1996 to thank the ocean that surrounds the island nation. The date commemorates Emperor Meiji's 1876 voyage from Hokkaido aboard a steam ship — the first time an emperor had travelled by sea."
  },
  "Mountain Day": {
    country:'JP',
    text: "Yama no Hi, Japan's newest national holiday (added 2016), promotes appreciation of mountains and their benefits. Japan is 73% mountainous — its 111 active volcanoes include Mount Fuji, climbed by 300,000 people annually. The date August 11 was chosen because '8' resembles mountains and '11' resembles trees."
  },
  "Respect for the Aged Day": {
    country:'JP',
    text: "Keirō no Hi was established in 1966 in the village of Noma-cho, which had declared September 15 'Aged People's Day' since 1947. Japan has the world's oldest population — over 10% are 80 or older. On this day, municipalities send gifts to centenarians, of which Japan has over 90,000."
  },
  "Autumnal Equinox": {
    country:'JP',
    text: "Shūbun no Hi mirrors the spring equinox — a Buddhist holiday for visiting graves and honouring ancestors. Japanese families share ohagi — sticky rice balls coated in sweet red bean paste — a traditional offering. The equinox week is called Higan, meaning both 'other shore' and a type of spider lily."
  },
  "Sports Day": {
    country:'JP',
    text: "Taiiku no Hi originally commemorated the opening of the 1964 Tokyo Olympics on October 10 — the date chosen as statistically Tokyo's sunniest autumn day. Renamed Sports Day in 2020 to coincide with the (postponed) Tokyo Olympics, it moved to the second Monday of October."
  },
  "Culture Day": {
    country:'JP',
    text: "Bunka no Hi marks the date Japan's 1946 post-war constitution was proclaimed. Chosen to symbolise peace and freedom, it's celebrated with the Order of Culture awards presented by the Emperor, parades of traditional performing arts, and free entry to many national museums."
  },
  "Labour Thanksgiving Day": {
    country:'JP',
    text: "Kinrō Kansha no Hi evolved from Niiname-sai — a 1,500-year-old Shinto harvest ritual where the Emperor offers newly harvested rice to the gods and tastes it himself. Renamed in 1948 to honour labour and production, it quietly bridges ancient agricultural Japan and the modern workforce."
  },
};

// ─── SEARCH TAB ──────────────────────────────────────────────────
// Filter metadata — each preset has:
//   impliedType — locks Row 2 to this type when active (null = free)
//   isStatus    — layers on top of typeF (doesn't override it)
//   icon        — emoji shown in chip
const QUICK_FILTERS = (() => {
  const startOfToday = () => {
    const d = new Date(); d.setHours(0,0,0,0); return d;
  };
  const todayStr = () => fd(new Date());

  // Undone, uncancelled task OR reminder — always surfaces in time-scope views
  const isActive = e =>
    (e.type === 'task' || e.type === 'reminder') && !e.done && !e.cancelled;

  // Done task or reminder — shows on the day it was completed
  // If doneAt exists → use that date
  // If no doneAt (completed before this feature) → treat as today so it's always visible
  const isDoneEntry = e => {
    if (!((e.type === 'task' || e.type === 'reminder') && !!e.done && !e.cancelled)) return false;
    const completedDate = e.doneAt
      ? e.doneAt.slice(0, 10)
      : todayStr(); // no timestamp = assume completed today
    return { completedDate };
  };

  return [
    { k:'today',    l:'Today',              icon:'📅', impliedType:null,      isStatus:false,
      f: e => {
        // Undone tasks/reminders always visible — they need attention today
        if (isActive(e)) return true;
        // Done tasks/reminders show on the day they were completed
        const done = isDoneEntry(e);
        if (done) return done.completedDate === todayStr();
        // All other entry types: show only if today
        return e.date === todayStr();
      },
    },
    { k:'week',     l:'This Week',          icon:'🗓', impliedType:null,      isStatus:false,
      f: e => {
        const sot = startOfToday();
        const end = new Date(sot); end.setDate(end.getDate() + 7);
        // Undone tasks/reminders always visible this week
        if (isActive(e)) return true;
        // Done tasks/reminders: use completion date if available
        const done = isDoneEntry(e);
        if (done) {
          const d = new Date(done.completedDate + 'T00:00:00');
          return d >= sot && d <= end;
        }
        const d = new Date(e.date + 'T00:00:00');
        return d >= sot && d <= end;
      },
    },
    { k:'month',    l:'This Month',         icon:'📆', impliedType:null,      isStatus:false,
      f: e => {
        const n = new Date(); n.setHours(0,0,0,0);
        // Undone tasks/reminders always visible this month
        if (isActive(e)) return true;
        // Done tasks/reminders: use completion date if available
        const done = isDoneEntry(e);
        if (done) {
          const d = new Date(done.completedDate + 'T00:00:00');
          return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d >= n;
        }
        const d = new Date(e.date + 'T00:00:00');
        return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d >= n;
      },
    },
    { k:'flights',  l:'Upcoming Flights',   icon:'✈️', impliedType:'flight',  isStatus:false,
      f: e => e.type === 'flight' && e.date >= todayStr() },
    { k:'reminders',l:'Upcoming Reminders', icon:'⏰', impliedType:'reminder',isStatus:false,
      f: e => e.type === 'reminder' && e.date >= todayStr() && !e.done && !e.cancelled },
    { k:'birthdays',l:'Upcoming Birthdays', icon:'🎂', impliedType:'birthday',isStatus:false,
      f: e => e.type === 'birthday' && e.date >= todayStr() },
    { k:'pending',  l:'Pending Tasks',      icon:'✓',  impliedType:'task',    isStatus:false,
      f: e => e.type === 'task' && !e.done && !e.cancelled },
    // ── History filters ────────────────────────────────────────────────────
    { k:'done-tasks',     l:'Completed Tasks',    icon:'✅', impliedType:'task',    isStatus:true,
      f: e => e.type === 'task' && !!e.done && !e.cancelled },
    { k:'done-reminders', l:'Completed Reminders',icon:'🔔', impliedType:'reminder',isStatus:true,
      f: e => e.type === 'reminder' && !!e.done && !e.cancelled },
    { k:'landed',         l:'Landed Flights',     icon:'🛬', impliedType:'flight',  isStatus:true,
      f: e => e.type === 'flight' && e.date < todayStr() },
    { k:'past-events',    l:'Past Events',        icon:'📋', impliedType:'event',   isStatus:true,
      f: e => (e.type === 'event' || e.type === 'meeting') && e.date < todayStr() },
  ];
})();

// Time-scope presets — mutually exclusive (only one at a time)
const TIME_SCOPE_KEYS = new Set(['today','week','month']);

// Type chip config — icon + label for visual chips
const TYPE_CHIPS = [
  { t:'all',      icon:'◉', label:'All' },
  { t:'meeting',  icon:'◯', label:'Appt' },
  { t:'task',     icon:'□', label:'Task' },
  { t:'flight',   icon:'◇', label:'Flight' },
  { t:'reminder', icon:'◷', label:'Reminder' },
  { t:'event',    icon:'◈', label:'Event' },
  { t:'birthday', icon:'🎂', label:'Birthday' },
];

function SearchTab({ entries, onToggle, onCancel, onEdit, onDelete, currentUserId, isAdmin=false }) {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  const TC = getTC(C);
  const [q,              setQ]             = useState('');
  const [typeF,          setTypeF]         = useState('all');
  const [whenF,          setWhenF]         = useState('all');
  const [statusF,        setStatusF]       = useState('all');
  const [showFilters,    setShowFilters]   = useState(true);
  const [activeTab,      setActiveTab]     = useState('search');
  const [holidayRange,   setHolidayRange]  = useState('3m');
  const [holidayCountry, setHolidayCountry]= useState('all');
  const [expandedHoliday,setExpandedHoliday]=useState(null);

  const HOLIDAY_RANGES = [
    { k:'1w', l:'This Week',   days:7   },
    { k:'1m', l:'This Month',  days:30  },
    { k:'3m', l:'3 Months',    days:90  },
    { k:'6m', l:'6 Months',    days:180 },
    { k:'1y', l:'1 Year',      days:365 },
    { k:'2y', l:'2 Years',     days:730 },
  ];

  // Upcoming holidays — filtered by range and country
  const upcomingHolidays = useMemo(() => {
    const today = fd(new Date());
    const rangeDays = HOLIDAY_RANGES.find(r => r.k === holidayRange)?.days || 90;
    const limit = fd(new Date(Date.now() + rangeDays*86400000));
    return PUBLIC_HOLIDAYS
      .filter(h => h.date >= today && h.date <= limit &&
        (holidayCountry === 'all' || h.country === holidayCountry))
      .sort((a,b) => a.date.localeCompare(b.date));
  }, [holidayRange, holidayCountry]);

  // ── WHEN / TYPE / STATUS filter options ──────────────────────
  const WHEN_OPTS = [
    { k:'all',         l:'All Time',           icon:'◎' },
    { k:'today',       l:'Today',              icon:'📅' },
    { k:'week',        l:'This Week',          icon:'🗓' },
    { k:'month',       l:'This Month',         icon:'📆' },
    { k:'future',      l:'After This Month',   icon:'🔭' },
    { k:'last-week',   l:'Last Week',          icon:'⏮' },
    { k:'last-month',  l:'Last Month',         icon:'📂' },
    { k:'older',       l:'Before Last Month',  icon:'🗃' },
  ];

  const STATUS_OPTS = [
    { k:'all',    l:'All Status' },
    { k:'active', l:'active' },  // resolved dynamically in render
    { k:'done',   l:'done'   },  // resolved dynamically in render
  ];

  const statusLabel = (k) => {
    if (k === 'active') {
      if (typeF === 'flight') return 'Upcoming';
      if (typeF === 'task' || typeF === 'reminder') return 'Active';
      return 'Upcoming / Active';
    }
    if (k === 'done') {
      if (typeF === 'flight') return 'Landed';
      if (typeF === 'task' || typeF === 'reminder') return 'Completed';
      return 'Completed / Past';
    }
    return 'All Status';
  };

  const clearAll = () => { setWhenF('all'); setTypeF('all'); setStatusF('all'); setQ(''); };
  const hasFilter = whenF !== 'all' || typeF !== 'all' || statusF !== 'all' || q.trim().length > 0;

  const [sortAsc, setSortAsc] = useState(true); // default: earliest first

  // ── Results ───────────────────────────────────────────────────
  const results = useMemo(() => {
    const todayStr = fd(new Date());
    const sot = new Date(); sot.setHours(0,0,0,0);
    const weekEnd  = fd(new Date(sot.getTime() + 7*86400000));
    const monthEnd = (() => { const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()+1); d.setDate(0); return fd(d); })();
    // Last week: Mon–Sun of the previous calendar week
    const lastWeekEnd   = fd(new Date(sot.getTime() - (sot.getDay() === 0 ? 1 : sot.getDay()) * 86400000));
    const lastWeekStart = fd(new Date(new Date(lastWeekEnd+'T00:00:00').getTime() - 6*86400000));
    // Last month: 1st–last of the previous calendar month
    const lastMonthEnd   = (() => { const d=new Date(); d.setDate(0); return fd(d); })();
    const lastMonthStart = lastMonthEnd.slice(0,7) + '-01';

    let r = entries;

    // ── TYPE filter ──────────────────────────────────────────────
    if (typeF !== 'all') {
      if (typeF === 'event') {
        r = r.filter(e => e.type === 'event' || e.type === 'meeting');
      } else {
        r = r.filter(e => e.type === typeF);
      }
    }

    // ── STATUS filter — mirrors ECard strikethrough logic exactly ────────────
    const nowMs = Date.now();
    // isVisuallyDone: returns true if the entry appears struck-out in the UI
    const isVisuallyDone = (e) => {
      if (e.cancelled) return false; // cancelled is its own state
      if (e.done) return true;
      const t = e.type;
      if (t === 'flight') {
        if (!e.date) return false;
        if (e.endTime) return new Date(`${e.date}T${e.endTime}`).getTime() < nowMs;
        const dep = e.time ? new Date(`${e.date}T${e.time}`).getTime() : new Date(`${e.date}T23:59`).getTime();
        return dep + (8 * 3600000) < nowMs;
      }
      // events, meetings, tasks, reminders — past due date+time
      if (!e.date) return false;
      const dt = e.time ? new Date(`${e.date}T${e.time}`) : new Date(`${e.date}T23:59`);
      return dt.getTime() < nowMs;
    };

    if (statusF === 'active') {
      r = r.filter(e => {
        if (e.cancelled) return false;
        return !isVisuallyDone(e);
      });
    } else if (statusF === 'done') {
      r = r.filter(e => {
        if (e.cancelled) return false;
        return isVisuallyDone(e);
      });
    }

    // ── WHEN filter ───────────────────────────────────────────────
    if (whenF !== 'all') {
      r = r.filter(e => {
        // Tasks/reminders: use doneAt for completed, date for active, null if undated
        let dateStr;
        if (e.type === 'task' || e.type === 'reminder') {
          dateStr = e.done && e.doneAt ? e.doneAt.slice(0,10) : (e.date || null);
        } else {
          dateStr = e.date || null;
        }
        if (!dateStr) return false; // no date = exclude from time-scoped views
        if (whenF === 'today')      return dateStr === todayStr;
        if (whenF === 'week')       return dateStr >= todayStr && dateStr <= weekEnd;
        if (whenF === 'month')      return dateStr >= todayStr && dateStr <= monthEnd;
        if (whenF === 'future')     return dateStr > monthEnd;
        if (whenF === 'last-week')  return dateStr >= lastWeekStart && dateStr <= lastWeekEnd;
        if (whenF === 'last-month') return dateStr >= lastMonthStart && dateStr <= lastMonthEnd;
        if (whenF === 'older')      return dateStr < lastMonthStart;
        return false; // unknown whenF key = exclude
      });
    }

    // ── TEXT search ───────────────────────────────────────────────
    if (q.trim()) {
      const lq = q.toLowerCase();
      r = r.filter(e =>
        [e.title,e.location,e.attendees,e.tags,e.notes,e.message,
         e.airline,e.flightNum,e.depCity,e.arrCity]
          .some(f => f && f.toLowerCase().includes(lq)));
    }

    // ── Sort: future-first for active, recent-first for done ─────
    return r.sort((a,b) => {
      const dA = a.date || (a.doneAt ? a.doneAt.slice(0,10) : '0000');
      const dB = b.date || (b.doneAt ? b.doneAt.slice(0,10) : '0000');
      // Upcoming: earliest first. History: most recent first
      return statusF === 'done' ? dB.localeCompare(dA) : dA.localeCompare(dB);
    });
  }, [entries, q, typeF, whenF, statusF]);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.bg }}>

      {/* ── TAB BAR ───────────────────────────────────────────── */}
      <div style={{ display:'flex', background:C.card, flexShrink:0,
        borderBottom:`1px solid ${C.border}` }}>
        {[
          { k:'search',   l:'Search',            icon:'🔍' },
          { k:'holidays', l:'Upcoming Festive',  icon:'🏖' },
        ].map(t => (
          <button key={t.k} onClick={() => setActiveTab(t.k)}
            style={{ flex:1, padding:'12px 8px', display:'flex', alignItems:'center',
              justifyContent:'center', gap:6, background:'transparent', border:'none',
              cursor:'pointer', fontFamily:'inherit',
              borderBottom: activeTab===t.k ? `2px solid ${C.rose}` : '2px solid transparent',
              color: activeTab===t.k ? C.rose : C.muted,
              fontWeight: activeTab===t.k ? 700 : 400, fontSize:13,
              transition:'all 0.15s' }}>
            <span>{t.icon}</span><span>{t.l}</span>
          </button>
        ))}
      </div>

      {/* ── HOLIDAYS TAB ──────────────────────────────────────── */}
      {activeTab === 'holidays' && (
        <div style={{ flex:1, overflowY:'auto', padding:'0 0 90px', display:'flex', flexDirection:'column' }}>
          {/* Filter bar */}
          <div style={{ background:C.card, borderBottom:`1px solid ${C.border}`,
            padding:'10px 16px', flexShrink:0 }}>
            {/* Range filters */}
            <p style={{ margin:'0 0 7px', fontSize:11, fontWeight:700, color:C.muted,
              textTransform:'uppercase', letterSpacing:'0.1em' }}>Time Range</p>
            <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:3 }}>
              {HOLIDAY_RANGES.map(r => (
                <button key={r.k} onClick={() => setHolidayRange(r.k)}
                  style={{ flexShrink:0, padding:'5px 13px', borderRadius:BR.pill,
                    background: holidayRange===r.k ? C.rose : C.elevated,
                    border:`1.5px solid ${holidayRange===r.k ? C.rose : C.border}`,
                    color: holidayRange===r.k ? '#fff' : C.dim,
                    fontSize:13, fontWeight: holidayRange===r.k ? 700 : 400,
                    cursor:'pointer', transition:'all 0.15s',
                    boxShadow: holidayRange===r.k ? `0 2px 8px ${C.rose}35` : 'none' }}>
                  {r.l}
                </button>
              ))}
            </div>
            {/* Country filters */}
            <p style={{ margin:'10px 0 7px', fontSize:11, fontWeight:700, color:C.muted,
              textTransform:'uppercase', letterSpacing:'0.1em' }}>Country</p>
            <div style={{ display:'flex', gap:6 }}>
              {[
                { k:'all', l:'All',       icon:'🌏' },
                { k:'SG',  l:'Singapore', icon:'🇸🇬' },
                { k:'JP',  l:'Japan',     icon:'🇯🇵' },
                { k:'FR',  l:'France',    icon:'🇫🇷' },
              ].map(cc => (
                <button key={cc.k} onClick={() => setHolidayCountry(cc.k)}
                  style={{ flexShrink:0, display:'flex', alignItems:'center', gap:5,
                    padding:'5px 13px', borderRadius:BR.pill,
                    background: holidayCountry===cc.k
                      ? (HC[cc.k] || C.rose)
                      : C.elevated,
                    border:`1.5px solid ${holidayCountry===cc.k
                      ? (HC[cc.k] || C.rose)
                      : C.border}`,
                    color: holidayCountry===cc.k ? '#fff' : C.dim,
                    fontSize:13, fontWeight: holidayCountry===cc.k ? 700 : 400,
                    cursor:'pointer', transition:'all 0.15s' }}>
                  <span>{cc.icon}</span><span>{cc.l}</span>
                </button>
              ))}
            </div>
            {/* Results summary */}
            <p style={{ margin:'10px 0 0', fontSize:12, color:C.muted, fontStyle:'italic' }}>
              {upcomingHolidays.length} holiday{upcomingHolidays.length!==1?'s':''} ·{' '}
              {HOLIDAY_RANGES.find(r=>r.k===holidayRange)?.l} ·{' '}
              {holidayCountry==='all' ? 'SG · JP · FR' :
               holidayCountry==='SG' ? 'Singapore' :
               holidayCountry==='JP' ? 'Japan' : 'France'}
            </p>
          </div>

          {/* Holiday list */}
          <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
          {upcomingHolidays.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px 20px',
              background:C.card, borderRadius:BR.card, border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:36, marginBottom:10, opacity:0.3 }}>🏖</div>
              <p style={{ margin:0, fontSize:15, color:C.muted, fontStyle:'italic' }}>
                No holidays in this period
              </p>
            </div>
          ) : (() => {
            const grouped = upcomingHolidays.reduce((acc, h) => {
              if (!acc[h.date]) acc[h.date] = [];
              acc[h.date].push(h);
              return acc;
            }, {});
            return Object.entries(grouped).map(([date, hs]) => {
              const dt = new Date(date+'T00:00:00');
              const isToday = date === fd(new Date());
              const daysAway = Math.ceil((dt - new Date().setHours(0,0,0,0)) / 86400000);
              return (
                <div key={date} style={{ marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                    <div style={{ background: isToday ? C.rose : C.elevated,
                      borderRadius:BR.btn, padding:'4px 10px',
                      border:`1px solid ${isToday ? C.rose : C.border}` }}>
                      <span style={{ fontSize:12, fontWeight:700,
                        color: isToday ? '#fff' : C.text }}>
                        {isToday ? 'Today' : dt.toLocaleDateString('en-US',
                          { weekday:'short', day:'numeric', month:'short', year:'numeric' })}
                      </span>
                    </div>
                    {!isToday && (
                      <span style={{ fontSize:11, color:C.muted, fontStyle:'italic' }}>
                        in {daysAway} day{daysAway!==1?'s':''}
                      </span>
                    )}
                  </div>
                  {(() => {
                    // Merge holidays with the same name (e.g. SG+JP Mother's Day → one card)
                    const merged = [];
                    hs.forEach(h => {
                      const existing = merged.find(m => m.name === h.name);
                      if (existing) { existing.countries.push(h.country); }
                      else { merged.push({ ...h, countries: [h.country] }); }
                    });
                    return merged.map((h, i) => {
                      const isBoth = h.countries.length > 1;
                      const accentColor = isBoth ? C.rose : (HC[h.countries[0]]||C.rose);
                      const infoKey = `${h.name}|${date}`;
                      const isExpanded = expandedHoliday === infoKey;
                      const info = HOLIDAY_INFO[h.name];
                      return (
                        <div key={i}
                          onClick={() => setExpandedHoliday(isExpanded ? null : infoKey)}
                          style={{ cursor:'pointer', background:C.card,
                            border:`1px solid ${accentColor}25`,
                            borderLeft:`4px solid ${accentColor}`,
                            borderRadius:BR.card, padding:'12px 16px', marginBottom:6,
                            boxShadow: isExpanded ? `0 4px 16px ${accentColor}18` : SH.subtle,
                            transition:'box-shadow 0.15s' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                            <span style={{ fontSize:22, flexShrink:0, letterSpacing:2 }}>
                              {h.countries.map(x=>({'SG':'🇸🇬','JP':'🇯🇵','FR':'🇫🇷','MY':'🇲🇾','GB':'🇬🇧','US':'🇺🇸','AU':'🇦🇺'}[x]||'')).join('')}
                            </span>
                            <div style={{ flex:1 }}>
                              <p style={{ margin:'0 0 2px', fontSize:15, fontWeight:700,
                                color:accentColor }}>{h.name}</p>
                              <p style={{ margin:0, fontSize:12, color:C.muted }}>
                                {h.countries.length > 1 ? h.countries.map(x=>({'SG':'Singapore','JP':'Japan','FR':'France'}[x]||x)).join(' & ') : ({'SG':'Singapore','JP':'Japan','FR':'France'}[h.countries[0]]||h.countries[0])}
                                {h.name!=="Mother's Day" && h.name!=="Father's Day" && ' · Public Holiday'}
                                {info && <span style={{ color:C.rose }}> · Tap to learn more</span>}
                              </p>
                            </div>
                            {info && (
                              <span style={{ fontSize:14, color:C.muted, flexShrink:0,
                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition:'transform 0.2s' }}>⌄</span>
                            )}
                          </div>
                          {isExpanded && info && (
                            <div style={{ marginTop:12, paddingTop:12,
                              borderTop:`1px solid ${accentColor}20` }}>
                              <p style={{ margin:0, fontSize:14, color:C.dim,
                                lineHeight:1.7, fontStyle:'italic' }}>
                                {info.text}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              );
            });
          })()}
          </div>
        </div>
      )}

      {/* ── SEARCH TAB ────────────────────────────────────────── */}
      {activeTab === 'search' && (<>
      <div style={{ background:C.card, flexShrink:0,
        borderBottom:`1px solid ${C.border}`,
        boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>

        {/* Search bar */}
        <div style={{ padding:'14px 16px 10px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10,
            background:C.bg, borderRadius:BR.card,
            padding:'12px 16px',
            border:`1.5px solid ${q ? C.rose : C.border}`,
            boxShadow: q ? `0 0 0 3px ${C.rose}18` : SH.subtle,
            transition:'border-color 0.15s, box-shadow 0.15s' }}>
            <span style={{ color: q ? C.rose : C.muted, fontSize:18,
              transition:'color 0.15s', flexShrink:0 }}>🔍</span>
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search entries, flights, tags…"
              style={{ flex:1, background:'transparent', border:'none', outline:'none',
                color:C.text, fontSize:16, fontFamily:'inherit' }} />
            {q
              ? <button onClick={() => setQ('')}
                  style={{ background:C.rose+'18', border:'none', color:C.rose,
                    cursor:'pointer', fontSize:14, fontWeight:700, padding:'3px 8px',
                    borderRadius:BR.pill, flexShrink:0 }}>✕</button>
              : null
            }
          </div>
        </div>

        {/* Filter toggle header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'0 16px 8px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, fontWeight:700, color:C.muted,
              textTransform:'uppercase', letterSpacing:'0.1em' }}>Filters</span>
            {hasFilter && (
              <span style={{ fontSize:11, fontWeight:700, color:'#fff',
                background:C.rose, borderRadius:BR.pill, padding:'1px 7px',
                minWidth:18, textAlign:'center' }}>
                {[whenF !== 'all', typeF !== 'all', statusF !== 'all'].filter(Boolean).length || null}
              </span>
            )}
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {hasFilter && (
              <button onClick={clearAll}
                style={{ fontSize:12, color:C.rose, fontWeight:700,
                  background:C.rose+'12', border:`1px solid ${C.rose}30`,
                  borderRadius:BR.pill, padding:'3px 10px', cursor:'pointer' }}>
                Clear
              </button>
            )}
            <button onClick={() => setShowFilters(p=>!p)}
              style={{ fontSize:12, color:C.dim, background:C.elevated,
                border:`1px solid ${C.border}`, borderRadius:BR.pill,
                padding:'3px 10px', cursor:'pointer' }}>
              {showFilters ? 'Hide ▲' : 'Show ▼'}
            </button>
          </div>
        </div>

        {showFilters && (<>
          {/* ══ FILTER PANEL: 3 orthogonal dimensions ══════════════
              WHEN   — time window (independent of status/type)
              WHAT   — entry type
              STATUS — active/upcoming vs completed/landed/past
          ════════════════════════════════════════════════════════ */}

          {/* ── WHEN ─────────────────────────────────────────────── */}
          <div style={{ padding:'8px 16px 4px' }}>
            <p style={{ margin:'0 0 6px', fontSize:11, fontWeight:700, color:C.muted,
              textTransform:'uppercase', letterSpacing:'0.12em' }}>When</p>
            <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4 }}>
              {WHEN_OPTS.map(opt => {
                const isActive = whenF === opt.k;
                return (
                  <button key={opt.k} onClick={() => setWhenF(isActive ? 'all' : opt.k)}
                    style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0,
                      background: isActive ? `linear-gradient(135deg,${C.rose},${C.roseL})` : C.elevated,
                      border:`1.5px solid ${isActive ? C.rose : C.border}`,
                      color: isActive ? '#fff' : C.dim,
                      borderRadius:BR.btn, padding:'6px 13px',
                      fontSize:13, fontWeight: isActive ? 700 : 500,
                      cursor:'pointer', whiteSpace:'nowrap',
                      boxShadow: isActive ? `0 2px 10px ${C.rose}40` : 'none',
                      transition:'all 0.15s' }}>
                    <span>{opt.l}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── WHAT ─────────────────────────────────────────────── */}
          <div style={{ padding:'6px 16px 4px' }}>
            <p style={{ margin:'0 0 6px', fontSize:11, fontWeight:700, color:C.muted,
              textTransform:'uppercase', letterSpacing:'0.12em' }}>What</p>
            <div style={{ display:'flex', gap:5, overflowX:'auto', paddingBottom:4 }}>
              {TYPE_CHIPS.map(({ t, icon, label }) => {
                const isActive = typeF === t;
                const col = t === 'all' ? C.rose : (getTC(C)[t] || C.rose);
                return (
                  <button key={t} onClick={() => { setTypeF(t); }}
                    style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0,
                      background: isActive ? col : C.elevated,
                      border:`1.5px solid ${isActive ? col : C.border}`,
                      color: isActive ? '#fff' : C.dim,
                      borderRadius:BR.card, padding:'6px 11px',
                      fontSize:13, fontWeight: isActive ? 700 : 400,
                      cursor:'pointer', whiteSpace:'nowrap',
                      boxShadow: isActive ? `0 2px 10px ${col}50` : 'none',
                      transition:'all 0.15s' }}>
                    <span style={{ fontSize:13 }}>{icon}</span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── STATUS ───────────────────────────────────────────── */}
          <div style={{ padding:'6px 16px 10px' }}>
            <p style={{ margin:'0 0 6px', fontSize:11, fontWeight:700, color:C.muted,
              textTransform:'uppercase', letterSpacing:'0.12em' }}>Status</p>
            <div style={{ display:'flex', gap:6, paddingBottom:4 }}>
              {STATUS_OPTS.map(opt => {
                const isActive = statusF === opt.k;
                const col = opt.k === 'done' ? C.T : opt.k === 'active' ? C.rose : C.muted;
                const displayLabel = statusLabel(opt.k);
                return (
                  <button key={opt.k} onClick={() => setStatusF(isActive ? 'all' : opt.k)}
                    style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0,
                      background: isActive ? col : C.elevated,
                      border:`1.5px solid ${isActive ? col : C.border}`,
                      color: isActive ? '#fff' : C.dim,
                      borderRadius:BR.btn, padding:'6px 13px',
                      fontSize:13, fontWeight: isActive ? 700 : 500,
                      cursor:'pointer', whiteSpace:'nowrap',
                      boxShadow: isActive ? `0 2px 10px ${col}40` : 'none',
                      transition:'all 0.15s' }}>
                    {opt.k === 'active' && <span style={{ fontSize:13 }}>🔜</span>}
                    {opt.k === 'done'   && <span style={{ fontSize:13 }}>✅</span>}
                    <span>{displayLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>)}

        {/* Active filter summary strip */}
        {hasFilter && (
          <div style={{ display:'flex', alignItems:'center', gap:6,
            padding:'6px 16px 10px', flexWrap:'wrap',
            borderTop:`1px solid ${C.border}`,
            background:C.rose+'06' }}>
            <span style={{ fontSize:11, color:C.muted, fontWeight:600,
              textTransform:'uppercase', letterSpacing:'0.08em' }}>Active:</span>
            {whenF !== 'all' && (
              <span style={{ fontSize:12, fontWeight:700, color:C.rose,
                background:C.rose+'15', border:`1px solid ${C.rose}30`,
                borderRadius:BR.pill, padding:'2px 10px', display:'flex',
                alignItems:'center', gap:4 }}>
                {WHEN_OPTS.find(x=>x.k===whenF)?.l}
                <button onClick={() => setWhenF('all')}
                  style={{ background:'transparent', border:'none', color:C.rose,
                    cursor:'pointer', fontSize:12, padding:0, lineHeight:1, marginLeft:2 }}>×</button>
              </span>
            )}
            {typeF !== 'all' && (
              <span style={{ fontSize:12, fontWeight:700, color:'#fff',
                background:getTC(C)[typeF]||C.rose,
                borderRadius:BR.pill, padding:'2px 10px', display:'flex',
                alignItems:'center', gap:4 }}>
                {TYPE_CHIPS.find(x=>x.t===typeF)?.icon} {TL[typeF]||typeF}
                <button onClick={() => setTypeF('all')}
                  style={{ background:'transparent', border:'none', color:'#fff',
                    cursor:'pointer', fontSize:12, padding:0, lineHeight:1, marginLeft:2 }}>×</button>
              </span>
            )}
            {statusF !== 'all' && (
              <span style={{ fontSize:12, fontWeight:700, color:'#fff',
                background: statusF === 'done' ? C.T : C.rose,
                borderRadius:BR.pill, padding:'2px 10px', display:'flex',
                alignItems:'center', gap:4 }}>
                {statusF === 'done' ? '✅' : '🔜'} {statusLabel(statusF)}
                <button onClick={() => setStatusF('all')}
                  style={{ background:'transparent', border:'none', color:'#fff',
                    cursor:'pointer', fontSize:12, padding:0, lineHeight:1, marginLeft:2 }}>×</button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── RESULTS ───────────────────────────────────────────── */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 16px 90px',
        boxSizing:'border-box' }}>
        {/* Results count + sort button */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'10px 0 6px' }}>
          <p style={{ margin:0, fontSize:13, color:C.muted, fontStyle:'italic' }}>
            {results.length === 0
              ? 'No results'
              : `${results.length} result${results.length!==1?'s':''}`}
            {q && <span style={{ color:C.dim }}> · matching "{q}"</span>}
          </p>
          <button onClick={() => setSortAsc(p => !p)}
            style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0,
              background: C.card, border:`1.5px solid ${C.border}`,
              borderRadius:BR.btn, padding:'5px 12px', cursor:'pointer',
              fontFamily:'inherit', transition:'all 0.15s',
              boxShadow:SH.subtle }}>
            <span style={{ fontSize:13 }}>{sortAsc ? '↑' : '↓'}</span>
            <span style={{ fontSize:12, fontWeight:600, color:C.dim }}>
              {sortAsc ? 'Earliest first' : 'Latest first'}
            </span>
          </button>
        </div>

        {results.length === 0
          ? <div style={{ textAlign:'center', padding:'48px 24px',
              background:C.card, borderRadius:BR.card, marginTop:6,
              border:`1px solid ${C.border}`, boxShadow:SH.subtle }}>
              <div style={{ fontSize:40, marginBottom:12, opacity:0.3 }}>🔍</div>
              <p style={{ margin:'0 0 6px', fontSize:16, fontWeight:600, color:C.dim }}>
                Nothing found
              </p>
              <p style={{ margin:'0 0 16px', fontSize:14, color:C.muted, fontStyle:'italic' }}>
                Try a different keyword or filter
              </p>
              {hasFilter && (
                <button onClick={clearAll}
                  style={{ background:C.rose, border:'none', color:'#fff',
                    borderRadius:BR.btn, padding:'10px 24px', fontSize:14,
                    fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                    boxShadow:`0 4px 14px ${C.rose}40` }}>
                  Clear all filters
                </button>
              )}
            </div>
          : <div style={{ background:C.card, borderRadius:BR.card, padding:'0 14px',
              boxShadow:SH.card, border:`1px solid ${C.border}` }}>
              {results.map(e => <ECard key={e.id} e={e} onToggle={onToggle}
                onCancel={onCancel} onEdit={onEdit} onDelete={onDelete}
                currentUserId={currentUserId} isAdmin={isAdmin} />)}
            </div>
        }
      </div>
      </>)}
    </div>
  );
}

// ─── PUSH NOTIFICATIONS ──────────────────────────────────────────
const VAPID_PUBLIC_KEY = 'BD8nfPF27K6GrPLtXX3GYfPOTlvnIJ1brHN8d1ZbH-02OyxAArUZuOhzffwUWMoRUhjm5KnGhEpyHPqEjdue7NI';

function urlBase64ToUint8Array(base64String) {
  const pad = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function MorningSummarySection({ userId }) {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  const [status,      setStatus]     = useState('checking');
  const [subError,    setSubError]   = useState('');
  const [notifyHour,  setNotifyHour] = useState(8);
  const [savingTime,  setSavingTime] = useState(false);
  const [timeLocked,  setTimeLocked] = useState(true); // locked by default

  useEffect(() => {
    // Detect inside useEffect — window guaranteed available here
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = !!window.navigator.standalone ||
      window.matchMedia('(display-mode: standalone)').matches;
    if (isIOS && !isStandalone) { setStatus('needs-install'); return; }
    if (!('Notification' in window) || !('serviceWorker' in navigator)) { setStatus('unsupported'); return; }
    if (Notification.permission === 'denied') { setStatus('denied'); return; }
    const timeout = setTimeout(() => setStatus('off'), 4000);
    navigator.serviceWorker.ready.then(reg => {
      clearTimeout(timeout);
      reg.pushManager.getSubscription().then(async sub => {
        if (sub) {
          const { data } = await supabase.from('push_subscriptions')
            .select('notify_hour').eq('user_id', userId)
            .eq('endpoint', sub.endpoint).single();
          if (data?.notify_hour != null) setNotifyHour(data.notify_hour);
          setStatus('on');
        } else {
          setStatus('off');
        }
      }).catch(() => setStatus('off'));
    }).catch(() => { clearTimeout(timeout); setStatus('off'); });
    return () => clearTimeout(timeout);
  }, []);

  const enable = async () => {
    setStatus('loading'); setSubError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setStatus('denied'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const j = sub.toJSON();

      // Delete ALL previous subscriptions for this user first —
      // prevents stale endpoints accumulating across reinstalls/SW changes
      await supabase.from('push_subscriptions')
        .delete().eq('user_id', userId);

      // Insert fresh subscription
      const { error } = await supabase.from('push_subscriptions').insert({
        user_id:      userId,
        endpoint:     j.endpoint,
        p256dh:       j.keys.p256dh,
        auth:         j.keys.auth,
        display_name: null,
        notify_hour:  notifyHour,
        updated_at:   new Date().toISOString(),
      });
      if (error) throw error;
      setStatus('on');
    } catch (err) {
      setSubError(err.message || 'Could not enable notifications');
      setStatus('off');
    }
  };

  const disable = async () => {
    setStatus('loading');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_subscriptions')
          .delete().eq('user_id', userId).eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus('off');
    } catch { setStatus('on'); }
  };

  const saveTime = async (h) => {
    setNotifyHour(h); setSavingTime(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_subscriptions')
          .update({ notify_hour: h, updated_at: new Date().toISOString() })
          .eq('user_id', userId).eq('endpoint', sub.endpoint);
      }
    } catch { /* silent */ }
    setSavingTime(false);
  };

  // Time options: every hour from 6am to 10pm SGT
  const TIME_OPTIONS = Array.from({ length: 17 }, (_, i) => {
    const h = i + 6;
    const ampm = h < 12 ? 'am' : 'pm';
    const display = h <= 12 ? h : h - 12;
    return { h, label: `${display}:00 ${ampm}` };
  });

  const badge = (label, color) => (
    <span style={{ fontSize:13, fontWeight:700, color,
      background: color+'18', borderRadius:BR.pill, padding:'2px 10px',
      border:`1px solid ${color}30` }}>{label}</span>
  );

  const statusBadge = () => {
    if (status === 'on')     return badge('✓ On',    SUCCESS);
    if (status === 'off')    return badge('Off',     C.muted);
    if (status === 'loading')return badge('…',       C.dim);
    if (status === 'denied') return badge('Blocked', WARN);
    return badge('N/A', C.muted);
  };

  return (
    <SS title="Notifications">
      <div style={{ padding:'16px 18px' }}>
        <div style={{ display:'flex', alignItems:'center',
          justifyContent:'space-between', marginBottom:6 }}>
          <div>
            <p style={{ margin:'0 0 2px', fontSize:16, fontWeight:500, color:C.text }}>
              Daily Summary
            </p>
            <p style={{ margin:0, fontSize:13, color:C.muted }}>
              Daily schedule notification · this device
            </p>
          </div>
          {statusBadge()}
        </div>

        {/* iOS install prompt */}
        {status === 'needs-install' && (
          <div style={{ background:C.rose+'10', borderRadius:BR.btn,
            borderLeft:`3px solid ${C.rose}`, padding:'10px 14px', marginTop:8 }}>
            <p style={{ margin:'0 0 4px', fontSize:13, fontWeight:700, color:C.rose }}>
              Install Kizuna first
            </p>
            <p style={{ margin:0, fontSize:13, color:C.dim, lineHeight:1.6 }}>
              In Safari: tap <strong>Share</strong> → <strong>Add to Home Screen</strong> → open Kizuna from the home screen icon, then return here.
            </p>
          </div>
        )}

        {status === 'denied' && (
          <p style={{ margin:'8px 0 0', fontSize:13, color:WARN, lineHeight:1.6 }}>
            Blocked. Go to <strong>iPhone Settings → Safari → Kizuna → Notifications</strong> to allow.
          </p>
        )}
        {status === 'unsupported' && (
          <p style={{ margin:'8px 0 0', fontSize:13, color:C.muted, fontStyle:'italic' }}>
            Not supported on this browser.
          </p>
        )}

        {subError ? <p style={{ margin:'8px 0 0', fontSize:13, color:WARN }}>{subError}</p> : null}

        {/* Time picker — shown when enabled */}
        {status === 'on' && (
          <div style={{ marginTop:14, background:C.elevated,
            borderRadius:BR.input, padding:'12px 14px',
            border:`1px solid ${C.border}` }}>
            <div style={{ display:'flex', alignItems:'center',
              justifyContent:'space-between', marginBottom: timeLocked ? 0 : 10 }}>
              <div>
                <p style={{ margin:0, fontSize:13, fontWeight:700, color:C.text }}>
                  Notification Time (SGT)
                </p>
                {timeLocked && (
                  <p style={{ margin:'2px 0 0', fontSize:12, color:C.muted }}>
                    {TIME_OPTIONS.find(t => t.h === notifyHour)?.label || `${notifyHour}:00`}
                    {savingTime && <span style={{ color:C.rose }}> · saving…</span>}
                  </p>
                )}
              </div>
              <button onClick={() => setTimeLocked(p => !p)}
                style={{ display:'flex', alignItems:'center', gap:5,
                  padding:'5px 11px', borderRadius:BR.pill, cursor:'pointer',
                  background: timeLocked ? C.elevated : C.rose+'18',
                  border:`1.5px solid ${timeLocked ? C.border : C.rose}`,
                  color: timeLocked ? C.muted : C.rose,
                  fontSize:12, fontWeight:700, fontFamily:'inherit',
                  transition:'all 0.15s' }}>
                <span>{timeLocked ? '🔒' : '🔓'}</span>
                <span>{timeLocked ? 'Locked' : 'Unlock'}</span>
              </button>
            </div>
            {!timeLocked && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {TIME_OPTIONS.map(({ h, label }) => (
                  <button key={h} onClick={() => saveTime(h)}
                    style={{ padding:'6px 13px', borderRadius:BR.pill,
                      background: notifyHour===h
                        ? `linear-gradient(135deg,${C.rose},${C.roseL})`
                        : C.card,
                      border:`1.5px solid ${notifyHour===h ? C.rose : C.border}`,
                      color: notifyHour===h ? '#fff' : C.dim,
                      fontSize:13, fontWeight: notifyHour===h ? 700 : 400,
                      cursor:'pointer', transition:'all 0.15s',
                      boxShadow: notifyHour===h ? `0 2px 8px ${C.rose}35` : 'none' }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Enable / Disable button */}
        {(status === 'off' || status === 'on') && (
          <button onClick={status === 'on' ? disable : enable}
            style={{ marginTop:14, width:'100%', padding:'11px',
              background: status === 'on'
                ? 'transparent'
                : `linear-gradient(135deg,${C.rose},${C.roseL})`,
              border:`1.5px solid ${status==='on' ? C.border : C.rose}`,
              borderRadius:BR.btn, fontSize:14, fontWeight:700,
              color: status === 'on' ? C.dim : '#fff',
              cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s',
              boxShadow: status === 'on' ? 'none' : `0 4px 14px ${C.rose}35` }}>
            {status === 'on' ? 'Turn Off Notifications' : 'Enable Daily Summary 🔔'}
          </button>
        )}

        {status === 'loading' && (
          <p style={{ marginTop:10, textAlign:'center', fontSize:13,
            color:C.muted, fontStyle:'italic' }}>Setting up…</p>
        )}
      </div>
    </SS>
  );
}

// ─── NEW MEMBER GUIDE ────────────────────────────────────────────
// Admin-only collapsible guide for registering new members.
function NewMemberGuide() {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  const [open, setOpen] = useState(false);

  const Step = ({ n, title, children }) => (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
        <div style={{ width:28, height:28, borderRadius:14, background:C.rose,
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <span style={{ fontSize:13, fontWeight:800, color:'#fff' }}>{n}</span>
        </div>
        <span style={{ fontSize:15, fontWeight:700, color:C.text }}>{title}</span>
      </div>
      <div style={{ marginLeft:38 }}>{children}</div>
    </div>
  );

  const Code = ({ children }) => (
    <div style={{ background:C.elevated, borderRadius:BR.input,
      padding:'10px 14px', marginTop:6, marginBottom:6,
      border:`1px solid ${C.border}`, overflowX:'auto' }}>
      <pre style={{ margin:0, fontSize:11, color:C.text,
        fontFamily:'Menlo,Courier New,monospace', lineHeight:1.7,
        whiteSpace:'pre-wrap', wordBreak:'break-all' }}>
        {children}
      </pre>
    </div>
  );

  const Note = ({ children }) => (
    <div style={{ background:C.rose+'10', borderRadius:BR.btn,
      borderLeft:`3px solid ${C.rose}`, padding:'8px 12px', marginTop:6 }}>
      <span style={{ fontSize:13, color:C.dim, fontStyle:'italic' }}>{children}</span>
    </div>
  );

  return (
    <div style={{ marginBottom:14 }}>
      <p style={{ fontSize:14, fontWeight:700, color:C.rose, textTransform:'uppercase',
        letterSpacing:'0.14em', margin:'28px 0 10px' }}>Add New Member</p>
      <div style={{ background:C.card, borderRadius:BR.card, overflow:'hidden',
        boxShadow:SH.card, border:`1px solid ${C.border}` }}>
        <button onClick={() => setOpen(p => !p)}
          style={{ width:'100%', display:'flex', alignItems:'center',
            justifyContent:'space-between', padding:'18px 20px',
            background:'transparent', border:'none', cursor:'pointer',
            fontFamily:'inherit' }}>
          <div>
            <p style={{ margin:0, fontSize:16, color:C.text, fontWeight:500,
              textAlign:'left' }}>Registration Guide</p>
            <p style={{ margin:0, fontSize:14, color:C.dim, marginTop:3,
              textAlign:'left' }}>6-step process for adding a new member</p>
          </div>
          <span style={{ fontSize:20, color:C.rose, flexShrink:0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition:'transform 0.2s' }}>⌄</span>
        </button>

        {open && (
          <div style={{ padding:'0 20px 20px',
            borderTop:`1px solid ${C.border}` }}>

            <Note>Complete all 6 steps in order. The member cannot see shared entries until every step is done.</Note>

            <div style={{ marginTop:20 }}>
              <Step n="1" title="Create their password login">
                <p style={{ margin:'0 0 4px', fontSize:13, color:C.dim }}>Run in Supabase SQL Editor:</p>
                <Code>{`INSERT INTO public.kizuna_users
  (email, passphrase_hash, display_name, is_active)
VALUES (
  'new@email.com',
  crypt('password', gen_salt('bf', 12)),
  'Their Name',
  true
);`}</Code>
              </Step>

              <Step n="2" title="Member signs in once">
                <p style={{ margin:0, fontSize:13, color:C.dim, lineHeight:1.6 }}>
                  Share the app URL, email, and password with them.{'\n'}
                  They must sign in at least once to create their account.
                </p>
                <Code>{`https://surferyogi.github.io/Kizuna-app/`}</Code>
              </Step>

              <Step n="3" title="Get their User ID">
                <p style={{ margin:'0 0 4px', fontSize:13, color:C.dim }}>Run in SQL Editor — copy the UUID returned:</p>
                <Code>{`SELECT id FROM auth.users
WHERE email = 'new@email.com';`}</Code>
              </Step>

              <Step n="4" title="Delete their auto-created workspace">
                <p style={{ margin:'0 0 4px', fontSize:13, color:C.dim }}>Replace NEW_USER_ID with the ID from Step 3:</p>
                <Code>{`DELETE FROM public.workspace_members
WHERE workspace_id = (
  SELECT id FROM public.workspaces
  WHERE owner_id = 'NEW_USER_ID'
);
DELETE FROM public.workspaces
WHERE owner_id = 'NEW_USER_ID';`}</Code>
              </Step>

              <Step n="5" title="Add them to the shared workspace">
                <Code>{`INSERT INTO public.workspace_members
  (workspace_id, user_id, role)
VALUES (
  '091ddb7a-c8a4-420f-b74f-e620916a44c2',
  'NEW_USER_ID',
  'member'
);`}</Code>
              </Step>

              <Step n="6" title="Set their display name">
                <Code>{`INSERT INTO public.profiles (id, display_name, updated_at)
VALUES ('NEW_USER_ID', 'Their Name', now())
ON CONFLICT (id) DO UPDATE
SET display_name = 'Their Name';`}</Code>
              </Step>
            </div>

            <div style={{ background:C.rose+'12', borderRadius:BR.card,
              padding:'14px 16px', marginTop:8,
              border:`1px solid ${C.rose}30` }}>
              <p style={{ margin:'0 0 6px', fontSize:14, fontWeight:700, color:C.rose }}>
                ✓ Final Step
              </p>
              <p style={{ margin:0, fontSize:13, color:C.dim, lineHeight:1.6 }}>
                Member signs out and back in once.{'\n'}
                Settings → Sign Out → enter email + password → Enter Kizuna 🌸
              </p>
            </div>

            <p style={{ margin:'14px 0 0', fontSize:12, color:C.muted,
              textAlign:'center', fontStyle:'italic' }}>
              Supabase SQL Editor: supabase.com/dashboard/project/xsbohyvvghhztknikpyf/sql
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RESET SECTION ───────────────────────────────────────────────
// Two-tap confirm guard — first tap shows warning, second tap executes reset.
// Separated to module level so it's never recreated inside SettingsTab.
function ResetSection({ onReset }) {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  const [confirming, setConfirming] = useState(false);
  return (
    <div style={{ marginBottom:40 }}>
      <p style={{ fontSize:13, fontWeight:700, color:WARN, textTransform:'uppercase',
        letterSpacing:'0.14em', margin:'24px 0 8px' }}>Danger Zone</p>
      <div style={{ background:C.card, borderRadius:BR.card, overflow:'hidden',
        boxShadow:SH.card, border:`1px solid ${WARN}40` }}>
        {!confirming ? (
          <div style={{ display:'flex', alignItems:'center', padding:'16px 18px', gap:12 }}>
            <div style={{ flex:1 }}>
              <p style={{ margin:0, fontSize:16, color:C.text, fontWeight:500 }}>Reset App Data</p>
              <p style={{ margin:0, fontSize:15, color:C.dim, marginTop:2 }}>
                Wipe all entries, audit log and storage. Cannot be undone.
              </p>
            </div>
            <button onClick={() => setConfirming(true)}
              style={{ background:'transparent', border:`1.5px solid ${WARN}`,
                color:WARN, borderRadius:BR.btn, padding:'8px 16px',
                fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                whiteSpace:'nowrap' }}>
              Reset…
            </button>
          </div>
        ) : (
          <div style={{ padding:'18px 18px' }}>
            <p style={{ margin:'0 0 6px', fontSize:16, fontWeight:700, color:'#D4804C' }}>
              Are you sure?
            </p>
            <p style={{ margin:'0 0 16px', fontSize:15, color:C.dim, lineHeight:1.5 }}>
              This permanently erases every entry, flight, reminder and activity log record.
              Your next sync will start with a completely blank database.
            </p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirming(false)}
                style={{ flex:1, background:C.elevated, border:`1px solid ${C.border}`,
                  color:C.dim, borderRadius:BR.btn, padding:'11px 0',
                  fontSize:16, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                Cancel
              </button>
              <button onClick={() => { setConfirming(false); onReset(); }}
                style={{ flex:1, background:'#A04E08', border:'none',
                  color:'#fff', borderRadius:BR.btn, padding:'11px 0',
                  fontSize:16, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                  boxShadow:`0 4px 16px ${'#A04E08'}40` }}>
                Yes, Wipe Everything
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── INVITE MODAL ────────────────────────────────────────────────
function InviteModal({ onClose, workspaceId, invitedBy }) {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  const url    = 'https://surferyogi.github.io/Kizuna-app/';
  const qr     = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&color=B8715C&bgcolor=FFFEFB&data=${encodeURIComponent(url)}`;
  const [copied,       setCopied]       = useState(false);
  const [inviteEmail,  setInviteEmail]  = useState('');
  const [inviteSent,   setInviteSent]   = useState(false);
  const [inviteError,  setInviteError]  = useState('');
  const [inviteLoading,setInviteLoading]= useState(false);

  const copy = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); })
        .catch(() => fallback());
    } else { fallback(); }
  };
  const fallback = () => {
    const el = document.createElement('textarea');
    el.value = url; document.body.appendChild(el);
    el.select(); document.execCommand('copy');
    document.body.removeChild(el);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) { setInviteError('Please enter an email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setInviteError('Invalid email address.'); return; }
    if (!workspaceId) { setInviteError('Workspace not loaded. Please try again.'); return; }
    setInviteLoading(true); setInviteError('');
    const ok = await dbInviteMember(workspaceId, invitedBy, email);
    setInviteLoading(false);
    if (ok) { setInviteSent(true); setInviteEmail(''); }
    else    { setInviteError('Failed to send invite. Please try again.'); }
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200,
      display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(44,38,32,0.40)',
        backdropFilter:'blur(4px)' }} onClick={onClose} />
      <div style={{ position:'relative', background:C.card, borderRadius:'24px 24px 0 0',
        border:`1px solid ${C.border}`, padding:'20px 22px 44px',
        boxShadow:SH.float }}>
        <div style={{ width:40, height:5, borderRadius:3, background:C.border, margin:'0 auto 18px' }} />
        <h3 style={{ margin:'0 0 4px', fontSize:21, fontWeight:600, color:C.text,
          fontFamily:'Cormorant Garamond,serif' }}>Invite to Kizuna 絆</h3>
        <p style={{ margin:'0 0 20px', fontSize:15, color:C.dim, fontStyle:'italic' }}>
          Share the link, scan the QR code, or invite by email
        </p>

        {/* Email invite */}
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          <input value={inviteEmail} onChange={e=>{setInviteEmail(e.target.value);setInviteSent(false);setInviteError('');}}
            onKeyDown={e=>e.key==='Enter'&&sendInvite()}
            placeholder="colleague@email.com" type="email"
            style={{ flex:1, background:C.elevated, border:`1px solid ${inviteError?WARN:C.border}`,
              borderRadius:BR.btn, padding:'11px 14px', fontSize:16, color:C.text,
              outline:'none', fontFamily:'inherit' }} />
          <button onClick={sendInvite} disabled={inviteLoading}
            style={{ background:C.rose, border:'none', color:'#fff', borderRadius:BR.btn,
              padding:'11px 18px', fontSize:15, fontWeight:700, cursor:'pointer',
              fontFamily:'inherit', opacity:inviteLoading?0.7:1, flexShrink:0 }}>
            {inviteLoading ? '…' : 'Invite'}
          </button>
        </div>
        {inviteError && <p style={{ margin:'-10px 0 10px', fontSize:13, color:WARN }}>{inviteError}</p>}
        {inviteSent  && <p style={{ margin:'-10px 0 10px', fontSize:13, color:SUCCESS }}>✓ Invite sent! They'll join when they sign up.</p>}

        {/* QR code */}
        <div style={{ display:'flex', justifyContent:'center', marginBottom:14 }}>
          <div style={{ background:C.elevated, borderRadius:BR.panel, padding:14,
            border:`1px solid ${C.border}`, boxShadow:SH.card }}>
            <img src={qr} alt="QR Code" width="160" height="160"
              style={{ display:'block', borderRadius:8 }} />
          </div>
        </div>
        {/* URL + copy */}
        <div style={{ display:'flex', gap:8, alignItems:'center',
          background:C.elevated, borderRadius:BR.btn, padding:'10px 14px',
          border:`1px solid ${C.border}`, marginBottom:14 }}>
          <span style={{ flex:1, fontSize:14, color:C.dim, overflow:'hidden',
            textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{url}</span>
          <button onClick={copy}
            style={{ background:copied?C.T:C.rose, border:'none', color:'#fff',
              borderRadius:8, padding:'6px 14px', fontSize:14, fontWeight:700,
              cursor:'pointer', fontFamily:'inherit', flexShrink:0,
              transition:'background 0.2s' }}>
            {copied ? '✓ Copied!' : 'Copy Link'}
          </button>
        </div>
        <p style={{ margin:0, fontSize:14, color:C.muted, textAlign:'center', fontStyle:'italic' }}>
          Members open the link in Safari → Share → Add to Home Screen
        </p>
      </div>
    </div>
  );
}


// ─── SETTINGS TAB ────────────────────────────────────────────────
// ─── Dev Panel sub-components (hooks need proper function components) ──────
// Dev panel: special occasion background previews
const OCCASION_DEMOS = [
  { label:"🌕 Otsukimi",    quote:{ quote:"In the hush of mid-autumn we gather — to offer rice dumplings, to watch the moon, to remember that we are small and the sky is ancient.", label:"Otsukimi · Mid-Autumn Festival", isSpecial:true } },
  { label:"🎄 Christmas",   quote:{ quote:"Christmas is not a time nor a season, but a state of mind. To cherish peace and goodwill, to be plenteous in mercy, is to have the real spirit of Christmas.", label:"Christmas Day · Special Quote", isSpecial:true } },
  { label:"💍 Anniversary", quote:{ quote:"Love is not a feeling — it is a thousand daily choices, made softly, held firmly, year after year.", label:"Anniversary · Special Quote", isSpecial:true } },
  { label:"🌸 Mother's Day", quote:{ quote:"Everything I am began in the warmth of her presence — a love so constant it became the air I breathe.", label:"Mother's Day · Special Quote", isSpecial:true } },
  { label:"👨 Father's Day", quote:{ quote:"He taught us not by what he said but by how he stayed — steady as earth beneath every storm.", label:"Father's Day · Special Quote", isSpecial:true } },
  { label:"🎂 Birthday",    quote:{ quote:"Today we count not just years but all the small brave moments that quietly shaped who we are becoming.", label:"Birthday · Special Quote", isSpecial:true } },
];

function DevOccasionTester() {
  const C = useContext(ThemeContext);
  const [testQuote, setTestQuote] = useState(null);
  return (
    <>
      {testQuote && (
        <DailyQuoteScreen
          quoteData={testQuote}
          loading={false}
          onDismiss={() => setTestQuote(null)}
        />
      )}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
        {OCCASION_DEMOS.map(({ label, quote }) => (
          <button key={label}
            onClick={() => setTestQuote(quote)}
            style={{ padding:'9px 12px', borderRadius:BR.input,
              background:C.elevated, border:`1px solid ${C.border}`,
              color:C.text, fontFamily:'inherit', fontSize:13,
              fontWeight:600, cursor:'pointer' }}>
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

// Seasonal quote data for the 4 seasons
const SEASON_QUOTES = [
  { key:'spring', label:'🌸 Spring', bg:'#120a0e', useCanvas:false,
    quote:{ quote:"In the quiet bloom of spring we find ourselves renewed, petal by petal, breath by breath.", label:"Being Present · Today's Reflection", isSpecial:false } },
  { key:'summer', label:'🎆 Summer', bg:'#020b18', useCanvas:true,
    quote:{ quote:"Summer holds our laughter like light holds the sea — boundless, warm, and endlessly free.", label:"Simple Joy · Today's Reflection", isSpecial:false } },
  { key:'autumn', label:'🍁 Autumn', bg:'#0e0802', useCanvas:true,
    quote:{ quote:"Letting go is how the maple becomes most beautiful — releasing what it held all year with grace.", label:"Home & Belonging · Today's Reflection", isSpecial:false } },
  { key:'winter', label:'❄️ Winter', bg:'#080d18', useCanvas:true,
    quote:{ quote:"In stillness we are held. Winter reminds us that rest is not absence — it is the ground of all becoming.", label:"Inner Calm · Today's Reflection", isSpecial:false } },
];

// Special occasion quotes (non-seasonal)
// Combined seasonal background + daily quote screen demo
function DevSeasonQuoteTester() {
  const C  = useContext(ThemeContext);
  const VW = window.innerWidth || 390;
  const VH = window.innerHeight || 844;
  const PW = 148, PH = 112;
  const scale = Math.min(PW / VW, PH / VH);
  const [testQuote,  setTestQuote]  = useState(null);
  const [testSeason, setTestSeason] = useState(null);

  const iconMap = { spring:<KizunaIcon />, summer:<FireworkIcon />,
                    autumn:<MomijiIcon />, winter:<SnowflakeIcon /> };
  const partMap = { spring:<SakuraPetals />, autumn:<MomijiOverlay isVisible intensity="light" /> };

  return (
    <>
      {/* Full-screen quote overlay when a card is tapped */}
      {testQuote && (
        <DailyQuoteScreen quoteData={testQuote} loading={false}
          seasonOverride={testSeason}
          onDismiss={() => { setTestQuote(null); setTestSeason(null); }} />
      )}

      {/* 4 tappable season preview cards */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:14 }}>
        {SEASON_QUOTES.map(s => (
          <div key={s.key}
            onClick={() => { setTestQuote(s.quote); setTestSeason(s.key); }}
            style={{
              width:PW, borderRadius:BR.card, cursor:'pointer',
              border:`1.5px solid ${C.border}`, overflow:'hidden',
              position:'relative', background:s.bg, flexShrink:0,
              boxShadow:'0 2px 10px rgba(0,0,0,0.4)',
              transition:'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform='scale(1.03)'; e.currentTarget.style.boxShadow='0 4px 18px rgba(0,0,0,0.6)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform='scale(1)';    e.currentTarget.style.boxShadow='0 2px 10px rgba(0,0,0,0.4)'; }}>

            {/* Canvas (summer/winter/autumn) — scaled to card */}
            {s.useCanvas && (
              <div style={{
                position:'absolute', top:0, left:0,
                width:VW, height:VH,
                transform:`scale(${scale})`, transformOrigin:'top left',
                pointerEvents:'none',
              }}>
                {s.key === 'summer' ? <HotaruOverlay isVisible colorScheme="dark" zIndex={0} />
                  : s.key === 'autumn' ? <MomijiOverlay isVisible intensity="light" />
                  : <WinterSnowBackground />}
              </div>
            )}

            {/* CSS particles (spring/autumn) */}
            {!s.useCanvas && (
              <div style={{ position:'relative', height:PH, overflow:'hidden' }}>
                {partMap[s.key]}
              </div>
            )}

            {/* Height spacer for canvas cards */}
            {s.useCanvas && <div style={{ height:PH }} />}

            {/* Season icon centred */}
            <div style={{
              position:'absolute', top:'50%', left:'50%',
              transform:'translate(-50%,-65%) scale(1.15)',
              zIndex:2, pointerEvents:'none',
            }}>
              {iconMap[s.key]}
            </div>

            {/* Tap hint + label */}
            <div style={{
              position:'relative', zIndex:2,
              textAlign:'center', paddingBottom:8, paddingTop:2,
              background:'linear-gradient(transparent,rgba(0,0,0,0.65))',
            }}>
              <div style={{ fontSize:11, fontWeight:700,
                color:'rgba(255,255,255,0.92)' }}>{s.label}</div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.55)',
                marginTop:1 }}>tap to preview</div>
            </div>
          </div>
        ))}
      </div>

    </>
  );
}

const SEASON_OPTIONS = [
  { key:'spring', label:'🌸 Spring', months:'March – May' },
  { key:'summer', label:'🎆 Summer', months:'June – August' },
  { key:'autumn', label:'🍁 Autumn', months:'September – November' },
  { key:'winter', label:'❄️ Winter', months:'December – February' },
];

function DevSeasonTester() {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  const [testSeason, setTestSeason] = useState(null);
  const iconMap  = { spring:<KizunaIcon />,   summer:<FireworkIcon />,
                     autumn:<MomijiIcon />,    winter:<SnowflakeIcon /> };
  const partMap  = { spring:<SakuraPetals />, summer:<FireworkParticles />,
                     autumn:<MomijiParticles />, winter:<SnowParticles /> };
  const active   = SEASON_OPTIONS.find(s => s.key === testSeason);
  return (
    <>
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        {SEASON_OPTIONS.map(({ key, label }) => (
          <button key={key} onClick={() => setTestSeason(testSeason === key ? null : key)}
            style={{ padding:'9px 12px', borderRadius:BR.input,
              background: testSeason === key ? C.rose : C.elevated,
              border:`1px solid ${testSeason === key ? C.rose : C.border}`,
              color: testSeason === key ? '#fff' : C.text,
              fontFamily:'inherit', fontSize:13, fontWeight:600,
              cursor:'pointer', transition:'all 0.2s' }}>
            {label}
          </button>
        ))}
      </div>
      {active && (
        <div style={{ display:'flex', alignItems:'center', gap:16,
          background:C.elevated, borderRadius:BR.card,
          padding:'16px 20px', border:`1px solid ${C.border}`,
          boxShadow:SH.subtle }}>
          <div style={{ position:'relative', flexShrink:0 }}>
            {iconMap[active.key]}
            {partMap[active.key]}
          </div>
          <div>
            <p style={{ margin:'0 0 3px', fontSize:15, fontWeight:700, color:C.text }}>{active.label}</p>
            <p style={{ margin:0, fontSize:12, color:C.muted }}>{active.months}</p>
          </div>
        </div>
      )}
    </>
  );
}

function SettingsTab({ onReset, userName = '', onChangeName, onSignOut, workspace, workspaceLoaded, setWorkspace, userId, isDark=false, themeMode='auto', setTheme, isAdmin=false, setFestiveTheme, setFestiveVisible }) {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  const AC = getAC(C);
  const [showInvite, setShowInvite] = useState(false);

  // Use live workspace members from Supabase — no localStorage fallback needed
  const members = (workspace?.members || []).filter(m => m.id !== userId);
  const removeMember = async (memberId) => {
    if (!workspace?.id) return;
    await dbRemoveMember(workspace.id, memberId);
    // Optimistic UI update — remove from local workspace state immediately
    setWorkspace(prev => prev ? {
      ...prev,
      members: prev.members.filter(m => m.id !== memberId)
    } : prev);
  };

  const InputStyle = {
    display:'block', marginTop:6, width:'100%', boxSizing:'border-box',
    background:C.card, border:`1.5px solid ${C.border}`,
    borderRadius:BR.input, padding:'14px 16px', color:C.text,
    fontSize:16, fontFamily:'inherit', outline:'none',
    transition:'border-color 0.15s',
  };

  return (
    <div style={{ padding:'0 18px 90px', overflowY:'auto', height:'100%', boxSizing:'border-box' }}>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} workspaceId={workspace?.id} invitedBy={userId} />}

      {/* Profile card */}
      <div style={{ paddingTop:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16, padding:20,
          background:C.card, borderRadius:BR.card,
          boxShadow:SH.card, border:`1px solid ${C.border}` }}>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:0, fontSize:21, fontWeight:600, color:C.text,
              fontFamily:'Cormorant Garamond,serif', overflow:'hidden',
              textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{userName || 'Your Name'}</p>
          </div>
          <button onClick={onChangeName}
            style={{ background:C.elevated, border:`1px solid ${C.border}`,
              borderRadius:BR.btn, padding:'8px 14px', fontSize:14, color:C.dim,
              cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>
            Edit
          </button>
          <button onClick={onSignOut}
            style={{ background:'transparent', border:`1px solid ${C.border}`,
              borderRadius:BR.btn, padding:'8px 14px', fontSize:14, color:C.muted,
              cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Workspace */}
      <SS title="Workspace">
        <SR label={`${members.length} member${members.length!==1?'s':''}`}
          sub={`You are ${isAdmin?'Admin':'Member'}`}
          right={<span style={{ fontSize:14, fontWeight:700,
            color:isAdmin?C.rose:C.dim,
            background:isAdmin?C.rose+'28':C.dim+'28',
            borderRadius:BR.card, padding:'4px 12px',
            textTransform:'capitalize', letterSpacing:'0.02em',
            border:`1px solid ${isAdmin?C.rose:C.dim}30` }}>
            {isAdmin?'Admin':'Member'}
          </span>} />
        <div style={{ padding:'0 18px 14px', borderTop:`1px solid ${C.border}` }}>
          <p style={{ fontSize:13, color:C.muted, margin:'10px 0 6px',
            fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' }}>Members</p>
          {members.map(m => (
            <div key={m.id} style={{ display:'flex', alignItems:'center',
              gap:10, padding:'6px 0',
              borderBottom:`1px solid ${C.border}` }}>
              {/* Avatar */}
              <div style={{ width:32, height:32, borderRadius:BR.panel, background:C.elevated,
                border:`1px solid ${C.border}`, flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span style={{ fontSize:15, color:C.dim }}>{m.name[0]}</span>
              </div>
              {/* Name */}
              <span style={{ flex:1, fontSize:16, color:C.text }}>{m.name}</span>
              {/* Delete — admin only */}
              {isAdmin && (
                <button onClick={() => removeMember(m.id)}
                  style={{ background:'transparent', border:`1px solid ${C.border}`,
                    borderRadius:8, width:28, height:28, cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color:C.muted, fontSize:16, flexShrink:0,
                    transition:'border-color 0.15s, color 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor=WARN; e.currentTarget.style.color=WARN; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.muted; }}>
                  ×
                </button>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <p style={{ fontSize:15, color:C.muted, textAlign:'center',
              padding:'16px 0', fontStyle:'italic' }}>No members yet</p>
          )}
          {/* Invite button */}
          <button onClick={() => setShowInvite(true)}
            style={{ marginTop:14, background:'transparent',
              border:`1.5px dashed ${C.rose}60`,
              borderRadius:BR.btn, padding:'10px 14px', color:C.rose,
              fontSize:16, cursor:'pointer', width:'100%',
              fontFamily:'inherit', transition:'border-color 0.15s',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            🌸 Invite via Link or QR Code
          </button>
        </div>
      </SS>

      {/* Entry Colour Key */}
      <SS title="Entry Colour Key">
        <div style={{ padding:'14px 18px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {Object.entries(TL).map(([t,l]) => (
            <div key={t} style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:12, height:12, borderRadius:4, background:TC[t]+'90', flexShrink:0 }} />
              <span style={{ fontSize:16, color:C.text }}>{l}</span>
            </div>
          ))}
        </div>
      </SS>

      {/* Notifications — Daily Summary */}
      <MorningSummarySection userId={userId} />

      {/* Appearance */}
      <SS title="Appearance">
        <div style={{ padding:'16px 18px' }}>
          <p style={{ margin:'0 0 10px', fontSize:16, fontWeight:500, color:C.text }}>
            Theme
          </p>
          <div style={{ display:'flex', gap:8 }}>
            {[
              { k:'light', icon:'☀️', label:'Light' },
              { k:'auto',  icon:'🔄', label:'Auto'  },
              { k:'dark',  icon:'🌙', label:'Dark'  },
            ].map(opt => (
              <button key={opt.k} onClick={() => setTheme(opt.k)}
                style={{ flex:1, display:'flex', flexDirection:'column',
                  alignItems:'center', gap:5, padding:'12px 8px',
                  borderRadius:BR.input, cursor:'pointer', fontFamily:'inherit',
                  transition:'all 0.2s',
                  background: themeMode === opt.k
                    ? (isDark
                        ? `linear-gradient(135deg,#3A2E5A,#2A2248)`
                        : `linear-gradient(135deg,${C.rose},${C.roseL})`)
                    : C.elevated,
                  border: `1.5px solid ${themeMode === opt.k
                    ? (isDark ? '#7A5AB8' : C.rose)
                    : C.border}`,
                  boxShadow: themeMode === opt.k
                    ? (isDark ? '0 2px 10px rgba(80,50,140,0.35)' : `0 2px 10px ${C.rose}35`)
                    : 'none' }}>
                <span style={{ fontSize:22 }}>{opt.icon}</span>
                <span style={{ fontSize:13, fontWeight: themeMode===opt.k ? 700 : 500,
                  color: themeMode===opt.k ? '#fff' : C.dim }}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
          <p style={{ margin:'10px 0 0', fontSize:12, color:C.muted,
            fontStyle:'italic', textAlign:'center' }}>
            {themeMode === 'auto'
              ? 'Auto · Dark 9:00 PM – 7:00 AM · Light otherwise'
              : themeMode === 'dark'
              ? 'Dark mode always on'
              : 'Light mode always on'}
          </p>
        </div>
      </SS>

      {/* Data & Privacy */}
      <SS title="Data & Privacy">
        <SR label="Encrypted at Rest" sub="All data secured by Supabase AES-256 encryption"
          right={<span style={{ fontSize:15, color:C.T, background:C.T+'18', borderRadius:BR.pill, padding:'2px 10px' }}>✓ Active</span>} />
        <SR label="Data Privacy" sub="Your data is private and never sold or shared"
          right={<span style={{ fontSize:15, color:C.T, background:C.T+'18', borderRadius:BR.pill, padding:'2px 10px' }}>✓ Active</span>} />
        <SR label="Persistent Storage" sub={`Schema v${SCHEMA_VERSION} · Auto-saves on every change`}
          right={<span style={{ fontSize:15, color:C.rose, background:C.rose+'18', borderRadius:BR.pill, padding:'2px 10px' }}>◯ Live</span>} />
        <SR label="Audit Trail" sub="All changes tracked · Append-only" noBorder
          right={<span style={{ fontSize:15, color:C.T, background:C.T+'18', borderRadius:BR.pill, padding:'2px 10px' }}>✓ On</span>} />
      </SS>

      {/* About */}
      <SS title="About">
        <div style={{ padding:'16px 18px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <SeasonIcon />
            <span style={{ fontSize:22, fontWeight:600, color:C.text,
              fontFamily:'Cormorant Garamond,serif' }}>Kizuna 絆</span>
          </div>
          <p style={{ margin:0, fontSize:13, color:C.muted }}>
            {APP_VERSION} · Released {APP_BUILD_DATE}<br/>
            <span style={{ color:C.rose }}>by Surferyogi</span>
          </p>
        </div>
        <SR label="Schema Version" sub={`Storage format v${SCHEMA_VERSION}`} noBorder
          right={<span style={{ fontSize:15, color:C.dim }}>v{SCHEMA_VERSION}</span>} />
      </SS>

      {/* ── Developer Panel — admin only ─────────────────────────── */}
      {isAdmin && (
        <SS title="Developer Panel 🛠">
          <div style={{ padding:'14px 18px' }}>
            <p style={{ margin:'0 0 14px', fontSize:13, color:C.dim, lineHeight:1.6 }}>
              Admin-only tools for testing features in production.
            </p>

            {/* ── Fireworks Test ── */}
            <div style={{ marginBottom:16 }}>
              <p style={{ margin:'0 0 8px', fontSize:14, fontWeight:700, color:C.text }}>
                🎆 Festive Fireworks
              </p>
              <p style={{ margin:'0 0 10px', fontSize:12, color:C.muted }}>
                Triggers automatically on festive days. Preview all themes here.
              </p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {[
                  { key:'nye',          label:'🎉 NYE'        },
                  { key:'new-year',     label:'🥂 New Year'   },
                  { key:'cny',          label:'🧧 CNY'        },
                  { key:'national-day', label:'🇸🇬 Natl Day'  },
                ].map(({ key, label }) => (
                  <button key={key}
                    onClick={() => { setFestiveTheme(key); setFestiveVisible(true); }}
                    style={{ padding:'9px 12px', borderRadius:BR.input,
                      background:C.elevated, border:`1px solid ${C.border}`,
                      color:C.text, fontFamily:'inherit', fontSize:13,
                      fontWeight:600, cursor:'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Special Occasion Backgrounds ── */}
            <div style={{ marginBottom:16, borderTop:`1px dashed ${C.border}`, paddingTop:14 }}>
              <p style={{ margin:'0 0 8px', fontSize:14, fontWeight:700, color:C.text }}>
                🎊 Special Occasion Screens
              </p>
              <p style={{ margin:'0 0 10px', fontSize:12, color:C.muted }}>
                Preview animated backgrounds for special days. Tap quote screen to dismiss.
              </p>
              <DevOccasionTester />
            </div>

            {/* ── Seasonal Quote + Background combined ── */}
            <div style={{ marginBottom:16, borderTop:`1px dashed ${C.border}`, paddingTop:14 }}>
              <p style={{ margin:'0 0 8px', fontSize:14, fontWeight:700, color:C.text }}>
                💬 Daily Quote Screen
              </p>
              <p style={{ margin:'0 0 12px', fontSize:12, color:C.muted }}>
                Tap a season card to preview the full quote screen with its live background animation.
              </p>
              <DevSeasonQuoteTester />
            </div>

            {/* ── Seasonal Icons Test ── */}
            <div style={{ borderTop:`1px dashed ${C.border}`, paddingTop:14 }}>
              <p style={{ margin:'0 0 8px', fontSize:14, fontWeight:700, color:C.text }}>
                🌸 Seasonal Icons
              </p>
              <p style={{ margin:'0 0 12px', fontSize:12, color:C.muted }}>
                Switches automatically by month. Preview all seasons here.
              </p>
              <DevSeasonTester />
            </div>

          </div>
        </SS>
      )}

      {/* Add New Member Guide — admin only */}
      {isAdmin && <NewMemberGuide />}

      {/* Reset App Data — admin only */}
      {isAdmin && <ResetSection onReset={onReset} />}
    </div>
  );
}

// ─── FORM FIELD COMPONENTS ───────────────────────────────────────
// Defined OUTSIDE EForm so React never unmounts/remounts them on re-render.
// Cursor jumping is caused by defining components inside render functions —
// React sees a new component type each render and resets focus.
const inputBase = {
  width:'100%', boxSizing:'border-box',
  background:C.card,
  border:`1.5px solid ${C.border}`,
  borderRadius:BR.input, padding:'14px 16px',
  color:C.text, fontSize:16,
  outline:'none', fontFamily:'inherit',
  transition:'border-color 0.15s',
};
const inputSm = {
  ...inputBase, padding:'11px 13px', fontSize:15, borderRadius:BR.btn,
};
function FI({ form, set, field, compact=false, ...props }) {
  return (
    <input value={form[field]||''} onChange={e => set(field, e.target.value)} {...props}
      style={{ ...(compact ? inputSm : inputBase), ...props.style }} />
  );
}
function TA({ form, set, field, ...props }) {
  return (
    <textarea value={form[field]||''} onChange={e => set(field, e.target.value)} rows={3} {...props}
      style={{ ...inputBase, resize:'vertical', lineHeight:1.5 }} />
  );
}
function FL({ label, children, tight=false }) {
  return (
    <div style={{ marginBottom: tight ? 10 : 14 }}>
      <label style={{ fontSize:12, color:'#9E8D80', display:'block',
        marginBottom:5, fontWeight:700,
        textTransform:'uppercase', letterSpacing:'0.1em' }}>{label}</label>
      {children}
    </div>
  );
}
function Row2({ children }) {
  return <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>{children}</div>;
}

// ─── AIRPORT PICKER COMPONENT ────────────────────────────────────────────────
function AirportPicker({ label, value, countryCode, onSelect, compact=false, inputStyle={} }) {
  const C = useContext(ThemeContext);
  const [q, setQ]           = useState(value || '');
  const [results, setResults] = useState([]);
  const [open, setOpen]      = useState(false);
  const ref                  = useRef(null);

  // Sync display text when value changes externally (auto-fill from flight lookup)
  useEffect(() => { setQ(value || ''); }, [value]);

  // Close on outside click
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleInput = (v) => {
    setQ(v);
    const r = searchAirports(v);
    setResults(r);
    setOpen(r.length > 0);
    if (r.length === 0) onSelect({ iata:'', city:v, name:'', country_code:'', country_name:'' });
  };

  const handleSelect = (airport) => {
    const [iata, city, name, country_code, country_name] = airport;
    setQ(`${iata} — ${city}`);
    setOpen(false);
    onSelect({ iata, city, name, country_code, country_name });
  };

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {countryCode && (
          <span style={{ fontSize:22, lineHeight:1 }}>{countryFlag(countryCode)}</span>
        )}
        <input
          value={q}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => { if (q.length >= 2) setOpen(searchAirports(q).length > 0); }}
          placeholder={compact ? 'City or IATA' : 'City, airport or IATA code'}
          style={{
            flex:1, padding: compact ? '10px 12px' : '13px 14px',
            borderRadius:BR.input, border:`1.5px solid ${C.border}`,
            background:C.elevated, color:C.text,
            fontFamily:'inherit', fontSize: compact ? 15 : 17,
            fontWeight:600, outline:'none', ...inputStyle,
          }}
          autoComplete="off"
        />
      </div>
      {open && results.length > 0 && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, right:0,
          background:C.card, border:`1.5px solid ${C.border}`,
          borderRadius:BR.card, zIndex:1000,
          boxShadow:`0 8px 32px rgba(0,0,0,0.25)`,
          maxHeight:240, overflowY:'auto',
        }}>
          {results.map(([iata, city, name, cc, cn]) => (
            <button key={iata}
              onMouseDown={() => handleSelect([iata, city, name, cc, cn])}
              style={{
                display:'flex', alignItems:'center', gap:10,
                width:'100%', padding:'11px 14px',
                background:'transparent', border:'none',
                borderBottom:`1px solid ${C.border}40`,
                cursor:'pointer', textAlign:'left',
              }}>
              <span style={{ fontSize:20 }}>{countryFlag(cc)}</span>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:C.text }}>
                  {iata} — {city}
                </div>
                <div style={{ fontSize:12, color:C.muted }}>{name} · {cn}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const mkBlank = () => ({
  type:'',title:'',date:'',time:'',endTime:'',location:'',attendees:'',notes:'',
  priority:'medium',tags:'',message:'',airline:'',flightNum:'',depCity:'',arrCity:'',
  depCountry:'',arrCountry:'',depCountryName:'',arrCountryName:'',
  travellers:[],traveller:'',travellerName:'',travellerNamesMap:{},
  terminal:'',gate:'',seat:'',visibility:'shared',repeat:'none',done:false
});

function EForm({ form, set, workspace = null, currentUserId = null }) {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  // Traveller options: current user + workspace members + Others
  const members = workspace?.members || [];
  const selfName = workspace?.members?.find(m => m.id === currentUserId)?.name || 'Me';
  const selfId = currentUserId || 'me';
  // Auto-generate flight title from IATA codes
  const prevAutoRef = useRef('');
  useEffect(() => {
    if (form.type !== 'flight' || !form.depCity || !form.arrCity) return;
    const autoTitle = `${form.depCity} → ${form.arrCity}`;
    if (!form.title || form.title === prevAutoRef.current) {
      prevAutoRef.current = autoTitle;
      set('title', autoTitle);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.depCity, form.arrCity, form.type]);

  // ── Flight auto-fill ─────────────────────────────────────────
  const [lookupStatus, setLookupStatus] = useState('');
  const [lookupData,   setLookupData]   = useState(null);
  const lastLookupKey  = useRef('');

  // Apply lookup data — always overwrite with live data, user can edit after
  useEffect(() => {
    if (!lookupData) return;
    // Auto-filled fields from APIs
    if (lookupData.terminal)    set('terminal',  lookupData.terminal);
    if (lookupData.gate)        set('gate',      lookupData.gate);
    if (lookupData.airlineName) set('airline',   lookupData.airlineName);
    if (lookupData.depIata)     set('depCity',   lookupData.depIata);
    if (lookupData.arrIata)     set('arrCity',   lookupData.arrIata);
    if (lookupData.aircraft)    set('notes',     lookupData.aircraft);
    const t = lookupData.scheduledDep ?? lookupData.revisedDep;
    if (t) {
      const hhmm = t.includes('T') ? t.split('T')[1]?.slice(0,5) : t.slice(0,5);
      if (hhmm) set('time', hhmm);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupData]);

  // Fire when flight number + date are both filled
  useEffect(() => {
    if (form.type !== 'flight') return;
    const clean = (form.flightNum||'').replace(/\s+/g,'').toUpperCase();
    if (clean.length < 3 || !form.date) return;

    // Airline from static table — instant, no network
    // Always apply — no stale closure guards
    {
      const name = airlineFromCode(clean);
      if (name) set('airline', name);
    }

    // FROM/TO from static route table — instant, no network
    const route = routeLookup(clean);
    if (route) {
      set('depCity', route.dep);
      set('arrCity', route.arr);
    }

    const key = `${clean}_${form.date}`;
    if (key === lastLookupKey.current) return;
    lastLookupKey.current = key;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) { setLookupStatus('not_found'); return; }

    setLookupStatus('loading');
    fetch(`${supabaseUrl}/functions/v1/flight-status`, {
      method:  'POST',
      headers: { 'Content-Type':'application/json',
                 'Authorization':`Bearer ${anonKey}` },
      body:    JSON.stringify({ flightNumber: clean, date: form.date }),
    })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(data => {
      if (data?.error) throw new Error(data.error);
      setLookupData(data);
      setLookupStatus('found');
    })
    .catch(err => {
      console.warn('Flight lookup:', err.message);
      setLookupStatus('not_found');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.flightNum, form.date, form.type]);

  // Convenience wrappers binding form+set — call as plain JSX, not components
  // These are NOT component definitions — just objects/fns to avoid re-renders
  const selStyle = { ...inputBase, appearance:'none', WebkitAppearance:'none' };

  return (
    <div style={{ paddingTop:8 }}>
      {/* Title shown for all types EXCEPT flight — flight title is auto-generated */}
      {form.type !== 'flight' && form.type !== 'birthday' && (
        <FL label="Title">
          <FI form={form} set={set} field="title" placeholder={`${TL[form.type]} title`} autoFocus />
        </FL>
      )}

      {form.type === 'flight' ? (<>
        {/* ── Traveller selector ── */}
        <FL label="Travelling As">
          {(() => {
            // Multi-select: travellers = array of userIds + 'other'
            const tvs = Array.isArray(form.travellers) ? form.travellers : (form.traveller ? [form.traveller] : [selfId]);
            // Name map for resolving IDs → display names
            const nameMap = { [selfId]: selfName };
            members.forEach(m => { nameMap[m.id] = m.name; });
            const toggle = (id) => {
              const next = tvs.includes(id) ? tvs.filter(t=>t!==id) : [...tvs, id];
              const safe = next.length > 0 ? next : [id]; // at least one
              set('travellers', safe);
              // Store names map so ECard can resolve IDs without workspace access
              const nm = {};
              safe.forEach(t => { if (t !== 'other') nm[t] = nameMap[t] || ''; });
              // Only include self if explicitly selected — not automatically
              set('travellerNamesMap', nm);
              // Keep legacy fields for backward compat
              set('traveller', safe.length===1 ? safe[0] : (safe.includes('other') ? 'other' : safe[0]));
            };
            const isSelected = (id) => tvs.includes(id);
            return (
              <>
                <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginBottom:2 }}>
                  {/* Self */}
                  <button type="button" onClick={() => toggle(selfId)}
                    style={{ padding:'7px 14px', borderRadius:BR.pill, fontFamily:'inherit', fontSize:14,
                      fontWeight:600, cursor:'pointer',
                      border:`1.5px solid ${isSelected(selfId)?C.rose:C.border}`,
                      background:isSelected(selfId)?C.rose+'22':'transparent',
                      color:isSelected(selfId)?C.rose:C.dim }}>
                    {isSelected(selfId)?'✓ ':''}{selfName}
                  </button>
                  {/* Workspace members (excluding self) */}
                  {members.filter(m => m.id !== currentUserId).map(m => (
                    <button key={m.id} type="button" onClick={() => toggle(m.id)}
                      style={{ padding:'7px 14px', borderRadius:BR.pill, fontFamily:'inherit', fontSize:14,
                        fontWeight:600, cursor:'pointer',
                        border:`1.5px solid ${isSelected(m.id)?C.rose:C.border}`,
                        background:isSelected(m.id)?C.rose+'22':'transparent',
                        color:isSelected(m.id)?C.rose:C.dim }}>
                      {isSelected(m.id)?'✓ ':''}{m.name}
                    </button>
                  ))}
                  {/* Others toggle */}
                  <button type="button" onClick={() => toggle('other')}
                    style={{ padding:'7px 14px', borderRadius:BR.pill, fontFamily:'inherit', fontSize:14,
                      fontWeight:600, cursor:'pointer',
                      border:`1.5px solid ${isSelected('other')?C.rose:C.border}`,
                      background:isSelected('other')?C.rose+'22':'transparent',
                      color:isSelected('other')?C.rose:C.dim }}>
                    {isSelected('other')?'✓ ':'✏️ '}Others
                  </button>
                </div>
                {isSelected('other') && (
                  <input
                    value={form.travellerName || ''}
                    onChange={e => set('travellerName', e.target.value)}
                    placeholder="Other traveller name"
                    style={{ marginTop:8, width:'100%', padding:'10px 14px', boxSizing:'border-box',
                      borderRadius:BR.input, border:`1.5px solid ${C.border}`,
                      background:C.elevated, color:C.text, fontFamily:'inherit', fontSize:15, outline:'none' }}
                  />
                )}
              </>
            );
          })()}
        </FL>

        {/* ── Step 1: Search keys — triggers auto-fill ── */}
        <Row2>
          <FL label="Flight No. (optional)">
            <FI form={form} set={set} field="flightNum" placeholder="SQ633 or leave blank" autoFocus compact
              onChange={e=>set('flightNum',e.target.value.replace(/\s+/g,'').toUpperCase())} />
          </FL>
          <FL label="Date"><FI form={form} set={set} field="date" type="date" compact /></FL>
        </Row2>

        {/* Lookup status */}
        {lookupStatus === 'loading' && (
          <p style={{ margin:'-6px 0 12px', fontSize:13, color:C.dim, fontStyle:'italic' }}>
            ✈ Looking up flight details…
          </p>
        )}
        {lookupStatus === 'found' && (
          <p style={{ margin:'-6px 0 12px', fontSize:13, color:SUCCESS }}>
            ✓ Flight found — details filled in below
          </p>
        )}
        {lookupStatus === 'not_found' && (
          <p style={{ margin:'-6px 0 12px', fontSize:13, color:C.muted, fontStyle:'italic' }}>
            Not found — please fill in manually
          </p>
        )}

        {/* ── AUTO-FILLED fields — from lookup ── */}
        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
            <div style={{ width:3, height:16, borderRadius:2,
              background:SUCCESS, flexShrink:0 }} />
            <p style={{ margin:0, fontSize:12, color:SUCCESS, fontWeight:700,
              textTransform:'uppercase', letterSpacing:'0.1em' }}>Auto-filled</p>
          </div>
          <FL label="Airline">
            <FI form={form} set={set} field="airline" placeholder="" />
          </FL>
          <Row2>
            <FL label="From" tight>
              <AirportPicker
                label="From"
                value={form.depCity}
                countryCode={form.depCountry}
                compact
                onSelect={({iata,city,country_code,country_name}) => {
                  set('depCity', iata || city);
                  set('depCountry', country_code);
                  set('depCountryName', country_name);
                }}
              />
            </FL>
            <FL label="To" tight>
              <AirportPicker
                label="To"
                value={form.arrCity}
                countryCode={form.arrCountry}
                compact
                onSelect={({iata,city,country_code,country_name}) => {
                  set('arrCity', iata || city);
                  set('arrCountry', country_code);
                  set('arrCountryName', country_name);
                }}
              />
            </FL>
          </Row2>
          <Row2>
            <FL label="Terminal" tight>
              <FI form={form} set={set} field="terminal" placeholder="" inputMode="numeric" />
            </FL>
            <FL label="Gate" tight>
              <FI form={form} set={set} field="gate" placeholder="" inputMode="numeric" />
            </FL>
          </Row2>
        </div>

        {/* ── MANUAL fields — enter manually ── */}
        <div style={{ background:`linear-gradient(135deg,#EDF5FD,#F0F7FF)`,
          border:`1.5px solid ${C.F}40`, borderRadius:BR.card,
          padding:'16px 16px 6px', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:14 }}>
            <div style={{ width:3, height:16, borderRadius:2,
              background:C.F, flexShrink:0 }} />
            <p style={{ margin:0, fontSize:12, color:'#6AAAD8', fontWeight:700,
              textTransform:'uppercase', letterSpacing:'0.1em' }}>Enter manually</p>
          </div>
          <FL label="Dep. Time" tight>
            <div style={{ maxWidth:180 }}>
              <input
                type="time"
                value={form.time||''}
                onChange={e => set('time', e.target.value)}
                style={{ ...inputBase,
                  background:'#fff',
                  border:`1.5px solid ${C.F}60`,
                  borderRadius:BR.input,
                  fontSize:18, fontWeight:600,
                  color:C.text }} />
            </div>
          </FL>
          <FL label="Seat" tight>
            <input
              type="text"
              value={form.seat||''}
              onChange={e => set('seat', e.target.value)}
              placeholder=""
              style={{ ...inputBase,
                background:'#fff',
                border:`1.5px solid ${C.F}60`,
                borderRadius:BR.input,
                fontSize:18, fontWeight:600,
                textAlign:'center',
                letterSpacing:'0.08em',
                color:C.text }} />
          </FL>
        </div>
      </>) : form.type === 'task' ? (<>
        <FL label="Due Date (optional)"><FI form={form} set={set} field="date" type="date" /></FL>
        <FL label="Time (optional)"><FI form={form} set={set} field="time" type="time" /></FL>
        <FL label="Location (optional)"><FI form={form} set={set} field="location" placeholder="Room, address, or virtual" /></FL>
        <FL label="Tags"><FI form={form} set={set} field="tags" placeholder="Finance, Legal, M&A" /></FL>
      </>) : form.type === 'reminder' ? (<>
        <FL label="Date (optional)"><FI form={form} set={set} field="date" type="date" /></FL>
        <FL label="Time"><FI form={form} set={set} field="time" type="time" /></FL>
        <FL label="Location (optional)"><FI form={form} set={set} field="location" placeholder="Room, address, or virtual" /></FL>
        <FL label="Message"><TA form={form} set={set} field="message" placeholder="Reminder details…" /></FL>
      </>) : form.type === 'birthday' ? (<>
        <FL label="Occasion"><FI form={form} set={set} field="title" placeholder="e.g. Mum's Birthday, Wedding Anniversary" autoFocus /></FL>
        <FL label="Date"><FI form={form} set={set} field="date" type="date" /></FL>
        <FL label="Notes"><TA form={form} set={set} field="notes" placeholder="Gift ideas, plans, memories…" /></FL>
      </>) : (<>
        <FL label="Date"><FI form={form} set={set} field="date" type="date" /></FL>
        <FL label="Start Time"><FI form={form} set={set} field="time" type="time" /></FL>
        <FL label="End Time"><FI form={form} set={set} field="endTime" type="time" /></FL>
        <FL label="Location"><FI form={form} set={set} field="location" placeholder="Room, address, or virtual" /></FL>
        {form.type==='meeting' && (
          <FL label="Attendees"><FI form={form} set={set} field="attendees" placeholder="Names or emails, comma-separated" /></FL>
        )}
        <FL label="Notes"><TA form={form} set={set} field="notes" placeholder="Additional details…" /></FL>
      </>)}

      {/* Repeat frequency — shown for birthday, event and reminder */}
      {['birthday','event','reminder'].includes(form.type) && (
        <FL label="Repeat">
          <select value={form.repeat||'none'} onChange={e=>set('repeat',e.target.value)} style={selStyle}>
            {[['none','Does not repeat'],['daily','Daily'],['weekly','Weekly'],['monthly','Monthly'],['yearly','Yearly']].map(([v,l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </FL>
      )}
      <FL label="Visibility">
        <select value={form.visibility} onChange={e=>set('visibility',e.target.value)} style={selStyle}>
          <option value="private">🔒 Private</option>
          <option value="shared">◯ Shared</option>
        </select>
      </FL>
    </div>
  );
}

function AddModal({ onClose, onSave, editEntry = null, initialDate = null, workspace = null, currentUserId = null, onLocationRefresh = null }) {
  const C = useContext(ThemeContext);
  const SH = getSH(C === C_DARK);
  const TC = getTC(C);
  const isEdit = editEntry !== null;
  const [step, setStep] = useState(isEdit ? 1 : 0);
  const [form, setForm] = useState(isEdit
    ? { ...mkBlank(), ...editEntry }
    : { ...mkBlank(), ...(initialDate ? { date: initialDate } : {}) }
  );
  const setF = useCallback((k, v) => setForm(p => ({ ...p, [k]:v })), []);
  const canSave = form.type === 'flight'
    // Can save with flight number, OR with at least From+To+Date (for past/parent entries)
    ? (form.flightNum?.trim().length > 0) ||
      (form.depCity?.trim().length > 0 && form.arrCity?.trim().length > 0 && form.date?.trim().length > 0)
    : form.type === 'birthday'
    ? (form.date?.trim().length > 0)               // birthday: needs date
    : (form.title?.trim().length > 0);             // others: need title
  const handleSave = () => {
    if (!canSave) return;
    const payload = isEdit
      ? { ...form, id: editEntry.id, type: editEntry.type }
      : { ...form, id: crypto.randomUUID() };
    onSave(payload);
    // Refresh location map if this flight has country data
    if (payload.type === 'flight' && payload.arrCountry && onLocationRefresh) {
      setTimeout(onLocationRefresh, 500); // brief delay so entry is persisted first
    }
    onClose();
  };

  const typeColor = TC[form.type] || C.rose;

  return (
    <div style={{ position:'absolute', inset:0, zIndex:100,
      display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(44,38,32,0.35)',
        backdropFilter:'blur(4px)' }} onClick={onClose} />
      <div style={{ position:'relative', background:C.card, borderRadius:'28px 28px 0 0',
        border:`1px solid ${C.border}`, borderBottom:'none', maxHeight:'92%',
        display:'flex', flexDirection:'column', boxShadow:SH.float }}>
        <div style={{ width:40, height:5, borderRadius:3, background:C.border, margin:'14px auto 0' }} />
        <div style={{ display:'flex', alignItems:'center', padding:'12px 22px 8px' }}>
          {/* Back only shown in create mode step 1 — not in edit mode (can't change type) */}
          {step===1 && !isEdit && (
            <button onClick={() => setStep(0)}
              style={{ background:'transparent', border:'none', color:C.rose,
                fontSize:16, cursor:'pointer', padding:'0 16px 0 0', fontWeight:700 }}>
              ‹ Back
            </button>
          )}
          <h2 style={{ flex:1, margin:0, fontSize:20, fontWeight:600, color:C.text,
            fontFamily:'Cormorant Garamond,serif' }}>
            {step===0 ? 'New Entry' : isEdit ? `Edit ${TL[form.type]}` : `New ${TL[form.type]}`}
          </h2>
          {step===1 ? (
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button onClick={onClose}
                style={{ background:C.elevated, border:`1px solid ${C.border}`,
                  color:C.dim, borderRadius:BR.btn, padding:'9px 16px',
                  fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                Cancel
              </button>
              <button onClick={handleSave}
                style={{ background:canSave?typeColor:C.elevated,
                  border:`1px solid ${canSave?typeColor:C.border}`,
                  color:canSave?'#fff':C.muted, borderRadius:BR.btn,
                  padding:'9px 20px', fontSize:17, fontWeight:600,
                  cursor:canSave?'pointer':'default',
                  boxShadow:canSave?`0 4px 16px ${typeColor}40`:'none',
                  fontFamily:'inherit', transition:'background 0.15s' }}>
                {isEdit ? 'Save Changes' : 'Save'}
              </button>
            </div>
          ) : (
            <button onClick={onClose}
              style={{ background:C.elevated, border:`1px solid ${C.border}`,
                color:C.dim, width:32, height:32, borderRadius:BR.panel,
                cursor:'pointer', fontSize:18, padding:0,
                display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
          )}
        </div>
        <div style={{ overflowY:'auto', padding:'6px 22px 44px', flex:1 }}>
          {step === 0 ? (
            <div>
              <p style={{ fontSize:16, color:C.dim, margin:'4px 0 16px', fontStyle:'italic' }}>
                What would you like to add?
              </p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {['meeting','task','flight','reminder','event','birthday'].map(t => (
                  <button key={t} onClick={() => {
                    const needsDate = t !== 'task' && t !== 'reminder';
                    setForm({...mkBlank(), ...(initialDate ? { date:initialDate } : needsDate ? { date:fd(new Date()) } : {}), type:t});
                    setStep(1);
                  }}
                    style={{ background:(TC[t]||C.rose)+'15', border:`1px solid ${(TC[t]||C.rose)}35`,
                      borderRadius:BR.card, padding:'18px 14px', cursor:'pointer', textAlign:'left',
                      display:'flex', flexDirection:'column', gap:6,
                      boxShadow:`0 2px 12px ${(TC[t]||C.rose)}15`,
                      transition:'transform 0.1s' }}>
                    <span style={{ fontSize:24 }}>{TI[t]}</span>
                    <span style={{ fontSize:16, fontWeight:600, color:getDTC(C)[t]||TC[t] }}>{TL[t]}</span>
                    <span style={{ fontSize:15, color:C.dim, lineHeight:1.4 }}>
                      {t==='meeting'?'Schedule an appointment'
                        :t==='task'?'Add a to-do item'
                        :t==='flight'?'Log flight details'
                        :t==='reminder'?'Set a reminder'
                        :t==='birthday'?'Mark a special date'
                        :'Create an event'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <EForm form={form} set={setF} workspace={workspace} currentUserId={currentUserId} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── KIZUNA ICON — TWO SAKURA 桜 ────────────────────────────────
// Flower 1: larger, lower-left — the dominant bloom.
// Flower 2: smaller, upper-right — the accent bloom, rendered behind.
// Three drifting petals add gracefulness between the two flowers.
// Petal path: authentic notched tip (bilobed split) of Prunus serrulata.
// ─── SEASON DETECTION ─────────────────────────────────────────────
function getSeason(now = new Date()) {
  const m = now.getMonth() + 1; // 1-12
  if (m >= 3 && m <= 5)  return 'spring';
  if (m >= 6 && m <= 8)  return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

// ─── SPRING: Sakura (original) ────────────────────────────────────
const KizunaIcon = () => {
  const P = "M 0,0 C -3.5,-3.5 -6,-8 -5,-12 C -4.5,-14.5 -2.5,-15 -0.8,-13 L 0,-13.8 L 0.8,-13 C 2.5,-15 4.5,-14.5 5,-12 C 6,-8 3.5,-3.5 0,0 Z";
  const ROTS = [0, 72, 144, 216, 288];
  const r = d => d * Math.PI / 180;
  return (
    <svg width="52" height="42" viewBox="0 0 52 42" fill="none"
      style={{ display:'block', flexShrink:0 }}>
      <g transform="translate(46,30) rotate(-22) scale(0.36)" opacity="0.42">
        <path d={P} fill="#EAA898" />
      </g>
      <g transform="translate(29,36) rotate(50) scale(0.30)" opacity="0.35">
        <path d={P} fill="#F0C0B4" />
      </g>
      <g transform="translate(4,7) rotate(-58) scale(0.26)" opacity="0.28">
        <path d={P} fill="#EAB8A8" />
      </g>
      {ROTS.map(rot => (
        <g key={`f2p${rot}`} transform={`translate(37,13) rotate(${rot + 36}) scale(0.65)`}>
          <path d={P} fill="#F0C0B4" stroke="#E0A898" strokeWidth="0.45" opacity="0.86" />
        </g>
      ))}
      <circle cx="37" cy="13" r="1.9" fill="#D09080" opacity="0.75" />
      {ROTS.map((rot, i) => (
        <circle key={`f2s${i}`}
          cx={(37 + Math.sin(r(rot)) * 3.3).toFixed(2)}
          cy={(13 - Math.cos(r(rot)) * 3.3).toFixed(2)}
          r="0.65" fill="#C89078" opacity="0.50" />
      ))}
      {ROTS.map(rot => (
        <g key={`f1p${rot}`} transform={`translate(15,27) rotate(${rot})`}>
          <path d={P} fill="#EAA898" stroke="#D48880" strokeWidth="0.35" opacity="0.93" />
        </g>
      ))}
      <circle cx="15" cy="27" r="2.8" fill="#C4826E" opacity="0.84" />
      {ROTS.map((rot, i) => (
        <circle key={`f1s${i}`}
          cx={(15 + Math.sin(r(rot)) * 5).toFixed(2)}
          cy={(27 - Math.cos(r(rot)) * 5).toFixed(2)}
          r="0.9" fill="#C4826E" opacity="0.52" />
      ))}
    </svg>
  );
};

// ─── SUMMER: Firework burst ───────────────────────────────────────
const FIREWORK_ICON_CSS = `
/* Firefly breathing — large orb, slow 2.8s cycle */
@keyframes ffBreathL {
  0%,100% { opacity:0.28; transform:scale(0.82); }
  50%      { opacity:1.00; transform:scale(1.00); }
}
/* Firefly breathing — small orb, faster 1.7s cycle, offset phase */
@keyframes ffBreathS {
  0%,100% { opacity:0.22; transform:scale(0.78); }
  50%      { opacity:0.92; transform:scale(1.00); }
}
/* Core hard dot pulse — synced to each orb */
@keyframes ffCoreL {
  0%,100% { opacity:0.55; r:2.2; }
  50%      { opacity:1.00; r:3.4; }
}
@keyframes ffCoreS {
  0%,100% { opacity:0.45; r:1.4; }
  50%      { opacity:0.95; r:2.2; }
}
/* Background sparkles — unchanged */
@keyframes fwFloat1 {
  0%   { transform:translate(0px, 0px) scale(0.85); opacity:0; }
  10%  { opacity:1; }
  30%  { transform:translate(5px,-8px) scale(1.05); }
  55%  { transform:translate(-4px,-14px) scale(0.95); }
  80%  { transform:translate(6px,-22px) scale(1.1);  opacity:0.85; }
  100% { transform:translate(2px,-30px) scale(0.8);  opacity:0; }
}
@keyframes fwFloat2 {
  0%   { transform:translate(0px, 0px) scale(0.9);  opacity:0; }
  12%  { opacity:0.9; }
  35%  { transform:translate(-7px,-10px) scale(1.0); }
  60%  { transform:translate(5px,-18px) scale(1.08); }
  85%  { transform:translate(-3px,-26px) scale(0.88); opacity:0.75; }
  100% { transform:translate(1px,-34px) scale(0.75); opacity:0; }
}
@keyframes fwFloat3 {
  0%   { transform:translate(0px, 0px) scale(1.0);  opacity:0; }
  8%   { opacity:0.95; }
  25%  { transform:translate(8px,-6px) scale(0.92); }
  50%  { transform:translate(-5px,-16px) scale(1.1); }
  78%  { transform:translate(7px,-24px) scale(0.9);  opacity:0.8; }
  100% { transform:translate(3px,-32px) scale(0.78); opacity:0; }
}
@keyframes fwFloat4 {
  0%   { transform:translate(0px, 0px) scale(0.88); opacity:0; }
  11%  { opacity:0.85; }
  40%  { transform:translate(-6px,-9px) scale(1.06); }
  65%  { transform:translate(4px,-19px) scale(0.94); }
  88%  { transform:translate(-2px,-28px) scale(1.0);  opacity:0.7; }
  100% { transform:translate(1px,-36px) scale(0.8);  opacity:0; }
}
@keyframes fwFloat5 {
  0%   { transform:translate(0px, 0px) scale(0.92); opacity:0; }
  9%   { opacity:0.9; }
  32%  { transform:translate(6px,-11px) scale(1.08); }
  58%  { transform:translate(-7px,-20px) scale(0.96); }
  82%  { transform:translate(5px,-27px) scale(1.05); opacity:0.78; }
  100% { transform:translate(2px,-35px) scale(0.82); opacity:0; }
}
@keyframes fwFloat6 {
  0%   { transform:translate(0px, 0px) scale(0.95); opacity:0; }
  13%  { opacity:0.88; }
  38%  { transform:translate(-4px,-8px) scale(1.02); }
  62%  { transform:translate(7px,-17px) scale(0.9);  }
  85%  { transform:translate(-3px,-25px) scale(1.08); opacity:0.72; }
  100% { transform:translate(2px,-33px) scale(0.8);  opacity:0; }
}
/* glow pulse on each dot */
@keyframes fwGlowPulse {
  0%,100% { box-shadow: 0 0 4px 2px currentColor; }
  50%     { box-shadow: 0 0 10px 5px currentColor; }
}
`;

const FW_SPARKLES = [
  { left:'12%', top:'60%', anim:'fwFloat1', dur:'3.2s', delay:'0.0s', color:'#A8FF60', size:8  },
  { left:'72%', top:'55%', anim:'fwFloat2', dur:'4.1s', delay:'1.1s', color:'#60FFD0', size:6  },
  { left:'88%', top:'48%', anim:'fwFloat3', dur:'3.6s', delay:'2.3s', color:'#FFE060', size:7  },
  { left:'28%', top:'65%', anim:'fwFloat4', dur:'4.8s', delay:'0.5s', color:'#80FF90', size:5  },
  { left:'55%', top:'60%', anim:'fwFloat5', dur:'3.9s', delay:'1.7s', color:'#BFFF50', size:6  },
  { left:'40%', top:'70%', anim:'fwFloat6', dur:'4.4s', delay:'0.9s', color:'#60E8FF', size:5  },
  { left:'6%',  top:'52%', anim:'fwFloat1', dur:'5.0s', delay:'2.8s', color:'#FFD880', size:4  },
  { left:'62%', top:'68%', anim:'fwFloat3', dur:'3.4s', delay:'3.5s', color:'#A0FF70', size:5  },
];

const FireworkIcon = () => (
  <div style={{ position:'relative', width:52, height:42,
    display:'block', flexShrink:0, overflow:'visible' }}>
    <style>{FIREWORK_ICON_CSS}</style>

    {/* ── Background floating glowing hues ── */}
    {FW_SPARKLES.map((s, i) => (
      <div key={i} style={{
        position:'absolute', top:s.top, left:s.left,
        width:s.size, height:s.size, borderRadius:'50%',
        background:`radial-gradient(circle, ${s.color} 0%, ${s.color}88 45%, transparent 100%)`,
        opacity:0, pointerEvents:'none',
        boxShadow:`0 0 ${s.size*1.5}px ${s.size*0.8}px ${s.color}66`,
        animationName:s.anim, animationDuration:s.dur, animationDelay:s.delay,
        animationTimingFunction:'ease-in-out',
        animationIterationCount:'infinite', animationFillMode:'both',
        zIndex:0, filter:`blur(0.4px)`,
      }} />
    ))}

    {/* ── Two breathing firefly glow orbs ── */}
    <svg width="52" height="42" viewBox="0 0 52 42" fill="none"
      style={{ position:'absolute', top:0, left:0, zIndex:1, overflow:'visible' }}>
      <defs>
        {/* Large orb radial gradient — warm yellow-green */}
        <radialGradient id="ffGL" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#d4ff70" stopOpacity="0.95" />
          <stop offset="35%"  stopColor="#a8e840" stopOpacity="0.55" />
          <stop offset="70%"  stopColor="#78c820" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#50a010" stopOpacity="0"    />
        </radialGradient>
        {/* Small orb radial gradient — softer lime-teal tint */}
        <radialGradient id="ffGS" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#c8ff88" stopOpacity="0.88" />
          <stop offset="40%"  stopColor="#90e060" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#60c040" stopOpacity="0"    />
        </radialGradient>
      </defs>

      {/* ── Large firefly — lower left, slow breath 2.8s ── */}
      {/* Outer aura */}
      <circle cx="15" cy="28" r="14"
        fill="url(#ffGL)"
        style={{ animation:'ffBreathL 2.8s ease-in-out infinite', transformOrigin:'15px 28px' }} />
      {/* Mid halo */}
      <circle cx="15" cy="28" r="7" fill="#b8f040" opacity="0.35"
        style={{ animation:'ffBreathL 2.8s ease-in-out infinite', transformOrigin:'15px 28px' }} />
      {/* Bright core */}
      <circle cx="15" cy="28" r="2.2" fill="#eeffa0"
        style={{ animation:'ffCoreL 2.8s ease-in-out infinite', transformOrigin:'15px 28px' }} />

      {/* ── Small firefly — upper right, faster breath 1.7s, 0.9s offset ── */}
      {/* Outer aura */}
      <circle cx="37" cy="13" r="9"
        fill="url(#ffGS)"
        style={{ animation:'ffBreathS 1.7s 0.9s ease-in-out infinite', transformOrigin:'37px 13px' }} />
      {/* Mid halo */}
      <circle cx="37" cy="13" r="4.5" fill="#a8e860" opacity="0.32"
        style={{ animation:'ffBreathS 1.7s 0.9s ease-in-out infinite', transformOrigin:'37px 13px' }} />
      {/* Bright core */}
      <circle cx="37" cy="13" r="1.4" fill="#e8ffc0"
        style={{ animation:'ffCoreS 1.7s 0.9s ease-in-out infinite', transformOrigin:'37px 13px' }} />
    </svg>
  </div>
);

// ─── AUTUMN: Momiji (maple) leaf ──────────────────────────────────
const MOMIJI_ICON_CSS = `
@keyframes mLeaf1 {
  0%   { transform:translate(8px,-12px) rotate(0deg);   opacity:0; }
  7%   { opacity:0.85; }
  28%  { transform:translate(20px,20px) rotate(50deg); }
  58%  { transform:translate(10px,42px) rotate(88deg); }
  100% { transform:translate(26px,66px) rotate(182deg); opacity:0; }
}
@keyframes mLeaf2 {
  0%   { transform:translate(28px,-8px) rotate(20deg);  opacity:0; }
  10%  { opacity:0.7; }
  26%  { transform:translate(14px,18px) rotate(-32deg); }
  54%  { transform:translate(6px,40px)  rotate(-80deg); }
  100% { transform:translate(18px,58px) rotate(-172deg); opacity:0; }
}
@keyframes mLeaf3 {
  0%   { transform:translate(48px,-10px) rotate(-10deg); opacity:0; }
  8%   { opacity:0.75; }
  32%  { transform:translate(38px,22px) rotate(58deg); }
  62%  { transform:translate(50px,44px) rotate(108deg); }
  100% { transform:translate(42px,64px) rotate(198deg); opacity:0; }
}
@keyframes mLeaf4 {
  0%   { transform:translate(16px,-6px) rotate(30deg);  opacity:0; }
  9%   { opacity:0.65; }
  30%  { transform:translate(4px,20px)  rotate(-42deg); }
  60%  { transform:translate(12px,42px) rotate(-96deg); }
  100% { transform:translate(2px,62px)  rotate(-192px); opacity:0; }
}
@keyframes mLeaf5 {
  0%   { transform:translate(38px,-14px) rotate(-20deg); opacity:0; }
  7%   { opacity:0.8; }
  30%  { transform:translate(52px,20px) rotate(62deg); }
  62%  { transform:translate(44px,44px) rotate(116deg); }
  100% { transform:translate(56px,64px) rotate(208deg); opacity:0; }
}
@keyframes mLeaf6 {
  0%   { transform:translate(22px,-8px) rotate(15deg);  opacity:0; }
  11%  { opacity:0.6; }
  28%  { transform:translate(8px,18px)  rotate(-36deg); }
  58%  { transform:translate(16px,40px) rotate(-90deg); }
  100% { transform:translate(6px,60px)  rotate(-184deg); opacity:0; }
}
`;
// Small leaf SVG — simple 5-lobe shape at ~12×14 units
// fill colour is passed per leaf for green/yellow variety
const BG_LEAF_PATH = "M0,1 C-1.5,0 -3.5,0.5 -5,-1 C-7,-3 -6.5,-6 -5,-8 C-3.5,-6 -2.5,-6 -2,-4 C-2.5,-6 -2,-9 0,-10 C2,-9 2.5,-6 2,-4 C2.5,-6 3.5,-6 5,-8 C6.5,-6 7,-3 5,-1 C3.5,0.5 1.5,0 0,1 Z";

// 6 falling leaves: greens → yellows spectrum
const MOMIJI_BG_LEAVES = [
  { anim:'mLeaf1', dur:'3.6s', delay:'0.0s', size:11, fill:'#4E8C2A', rot:15  },
  { anim:'mLeaf2', dur:'4.4s', delay:'1.4s', size:9,  fill:'#82B030', rot:-20 },
  { anim:'mLeaf3', dur:'3.2s', delay:'2.8s', size:10, fill:'#A8C420', rot:35  },
  { anim:'mLeaf4', dur:'5.0s', delay:'0.7s', size:8,  fill:'#C8C018', rot:-10 },
  { anim:'mLeaf5', dur:'3.8s', delay:'1.9s', size:9,  fill:'#D4A818', rot:25  },
  { anim:'mLeaf6', dur:'4.2s', delay:'3.3s', size:8,  fill:'#BCBA20', rot:-30 },
];

const MomijiIcon = () => (
  <div style={{ position:'relative', width:52, height:42,
    display:'block', flexShrink:0, overflow:'visible' }}>
    <style>{MOMIJI_ICON_CSS}</style>

    {/* ── Animated falling leaves — green/yellow SVGs behind the main emojis ── */}
    {MOMIJI_BG_LEAVES.map((l, i) => (
      <div key={i} style={{
        position:'absolute', top:0, left:0,
        opacity:0, userSelect:'none', pointerEvents:'none',
        animationName:l.anim, animationDuration:l.dur,
        animationDelay:l.delay, animationTimingFunction:'ease-in',
        animationIterationCount:'infinite', animationFillMode:'both',
        zIndex:0,
      }}>
        <svg width={l.size} height={l.size+2}
          viewBox="-7 -11 14 13" overflow="visible">
          <path d={BG_LEAF_PATH}
            fill={l.fill} stroke="#2A5010" strokeWidth="0.4" opacity="0.9"
            transform={`rotate(${l.rot})`} />
          <line x1="0" y1="1" x2="0" y2="-9"
            stroke="#2A5010" strokeWidth="0.5"
            strokeLinecap="round" opacity="0.5"
            transform={`rotate(${l.rot})`} />
        </svg>
      </div>
    ))}

    {/* ── Foreground: static large + small 🍁 — unchanged ── */}
    <div style={{ position:'absolute', bottom:0, left:0,
      fontSize:36, lineHeight:1, zIndex:1,
      transform:'rotate(-10deg)',
      filter:'drop-shadow(0 2px 6px rgba(180,60,0,0.55))',
      userSelect:'none' }}>🍁</div>
    <div style={{ position:'absolute', top:0, right:0,
      fontSize:21, lineHeight:1, zIndex:1,
      transform:'rotate(18deg)',
      filter:'drop-shadow(0 1px 4px rgba(180,60,0,0.45))',
      userSelect:'none' }}>🍁</div>
  </div>
);

// ─── WINTER: Snowflake ────────────────────────────────────────────
const SNOW_ICON_CSS = `
@keyframes sFlake1 {
  0%   { transform:translate(8px,-12px) rotate(0deg);    opacity:0; }
  8%   { opacity:0.8; }
  100% { transform:translate(22px,58px) rotate(180deg);  opacity:0; }
}
@keyframes sFlake2 {
  0%   { transform:translate(28px,-8px) rotate(20deg);   opacity:0; }
  12%  { opacity:0.65; }
  100% { transform:translate(12px,54px) rotate(-90deg);  opacity:0; }
}
@keyframes sFlake3 {
  0%   { transform:translate(46px,-10px) rotate(-15deg); opacity:0; }
  10%  { opacity:0.75; }
  100% { transform:translate(34px,60px) rotate(120deg);  opacity:0; }
}
@keyframes sFlake4 {
  0%   { transform:translate(16px,-6px) rotate(30deg);   opacity:0; }
  15%  { opacity:0.6; }
  100% { transform:translate(4px,52px) rotate(-150deg);  opacity:0; }
}
@keyframes sFlake5 {
  0%   { transform:translate(36px,-14px) rotate(-10deg); opacity:0; }
  9%   { opacity:0.7; }
  100% { transform:translate(50px,56px) rotate(200deg);  opacity:0; }
}
@keyframes sFlake6 {
  0%   { transform:translate(22px,-8px) rotate(15deg);   opacity:0; }
  13%  { opacity:0.55; }
  100% { transform:translate(8px,50px) rotate(-110deg);  opacity:0; }
}
`;
// Small snow dots — pure white circles of varying sizes
const SNOW_BG_DOTS = [
  { anim:'sFlake1', dur:'3.4s', delay:'0.0s', r:3.5 },
  { anim:'sFlake2', dur:'4.2s', delay:'1.3s', r:2.5 },
  { anim:'sFlake3', dur:'3.0s', delay:'2.7s', r:3.0 },
  { anim:'sFlake4', dur:'4.8s', delay:'0.6s', r:2.0 },
  { anim:'sFlake5', dur:'3.7s', delay:'1.8s', r:2.8 },
  { anim:'sFlake6', dur:'4.0s', delay:'3.2s', r:2.2 },
];

const SnowflakeIcon = () => (
  <div style={{ position:'relative', width:52, height:42,
    display:'block', flexShrink:0, overflow:'visible' }}>
    <style>{SNOW_ICON_CSS}</style>

    {/* ── Animated falling snow dots — white circles ── */}
    {SNOW_BG_DOTS.map((d, i) => (
      <div key={i} style={{
        position:'absolute', top:0, left:0, opacity:0,
        pointerEvents:'none',
        animationName:d.anim, animationDuration:d.dur, animationDelay:d.delay,
        animationTimingFunction:'linear',
        animationIterationCount:'infinite', animationFillMode:'both',
        zIndex:0,
      }}>
        <svg width={d.r*2+2} height={d.r*2+2}
          viewBox={`${-d.r-1} ${-d.r-1} ${d.r*2+2} ${d.r*2+2}`}>
          <circle cx="0" cy="0" r={d.r} fill="white" opacity="0.85" />
        </svg>
      </div>
    ))}

    {/* ── Foreground: static large + small ❄️ — unchanged ── */}
    <div style={{ position:'absolute', bottom:0, left:0,
      fontSize:36, lineHeight:1, zIndex:1,
      transform:'rotate(-10deg)',
      filter:'drop-shadow(0 2px 6px rgba(100,200,240,0.55))',
      userSelect:'none' }}>❄️</div>
    <div style={{ position:'absolute', top:0, right:0,
      fontSize:21, lineHeight:1, zIndex:1,
      transform:'rotate(18deg)',
      filter:'drop-shadow(0 1px 4px rgba(100,200,240,0.45))',
      userSelect:'none' }}>❄️</div>
  </div>
);
// ─── SEASONAL ICON WRAPPER ────────────────────────────────────────
const SeasonIcon = ({ season: seasonProp } = {}) => {
  const season = seasonProp || getSeason();
  if (season === 'summer') return <FireworkIcon />;
  if (season === 'autumn') return <MomijiIcon />;
  if (season === 'winter') return <SnowflakeIcon />;
  return <KizunaIcon />; // spring default
};

// ─── SAKURA PETALS (Spring) ───────────────────────────────────────
const PETAL_CSS = `
@keyframes petalFall1 {
  0%   { transform: translate(0px, -8px) rotate(0deg);   opacity:0; }
  10%  { opacity: 0.7; }
  100% { transform: translate(18px, 52px) rotate(340deg); opacity:0; }
}
@keyframes petalFall2 {
  0%   { transform: translate(0px, -4px) rotate(20deg);  opacity:0; }
  15%  { opacity: 0.5; }
  100% { transform: translate(-14px, 48px) rotate(-280deg); opacity:0; }
}
@keyframes petalFall3 {
  0%   { transform: translate(0px, -6px) rotate(-10deg); opacity:0; }
  12%  { opacity: 0.6; }
  100% { transform: translate(8px, 56px) rotate(400deg);  opacity:0; }
}
@keyframes petalFall4 {
  0%   { transform: translate(0px, -2px) rotate(30deg);  opacity:0; }
  20%  { opacity: 0.4; }
  100% { transform: translate(-20px, 44px) rotate(-320deg); opacity:0; }
}
@keyframes fireworkBurst {
  0%   { transform: scale(0.2) rotate(0deg);   opacity:0; }
  15%  { opacity: 1; }
  60%  { opacity: 0.9; }
  100% { transform: scale(1.4) rotate(20deg); opacity:0; }
}
@keyframes fireworkRise {
  0%   { transform: translate(0px, 60px) scale(0.1); opacity:0; }
  30%  { opacity: 0.9; }
  70%  { opacity: 0.8; }
  100% { transform: translate(var(--fx), -10px) scale(1.2); opacity:0; }
}
@keyframes momijiDrift1 {
  0%   { transform: translate(0px, -10px) rotate(0deg) scale(1);    opacity:0; }
  8%   { opacity:0.9; }
  30%  { transform: translate(8px, 22px) rotate(45deg) scale(0.95);  opacity:0.85; }
  60%  { transform: translate(14px, 46px) rotate(110deg) scale(0.9); opacity:0.75; }
  100% { transform: translate(18px, 80px) rotate(200deg) scale(0.8); opacity:0; }
}
@keyframes momijiDrift2 {
  0%   { transform: translate(0px, -8px) rotate(-15deg) scale(1);   opacity:0; }
  10%  { opacity:0.85; }
  25%  { transform: translate(-6px, 18px) rotate(-50deg) scale(0.95); opacity:0.8; }
  55%  { transform: translate(-12px, 42px) rotate(-120deg) scale(0.88); opacity:0.7; }
  100% { transform: translate(-20px, 78px) rotate(-240deg) scale(0.75); opacity:0; }
}
@keyframes momijiDrift3 {
  0%   { transform: translate(0px, -12px) rotate(10deg) scale(1);   opacity:0; }
  9%   { opacity:0.9; }
  20%  { transform: translate(5px, 16px) rotate(35deg) scale(0.96);  opacity:0.88; }
  50%  { transform: translate(10px, 40px) rotate(95deg) scale(0.9);  opacity:0.78; }
  80%  { transform: translate(15px, 62px) rotate(165deg) scale(0.82); opacity:0.55; }
  100% { transform: translate(12px, 82px) rotate(220deg) scale(0.75); opacity:0; }
}
@keyframes momijiDrift4 {
  0%   { transform: translate(0px, -8px) rotate(25deg) scale(1);    opacity:0; }
  12%  { opacity:0.8; }
  35%  { transform: translate(-8px, 24px) rotate(-30deg) scale(0.93); opacity:0.75; }
  65%  { transform: translate(-14px, 50px) rotate(-110deg) scale(0.85); opacity:0.65; }
  100% { transform: translate(-18px, 76px) rotate(-195deg) scale(0.75); opacity:0; }
}
@keyframes momijiDrift5 {
  0%   { transform: translate(0px, -6px) rotate(-8deg) scale(1);   opacity:0; }
  10%  { opacity:0.85; }
  40%  { transform: translate(10px, 28px) rotate(60deg) scale(0.92); opacity:0.8; }
  70%  { transform: translate(16px, 52px) rotate(140deg) scale(0.84); opacity:0.6; }
  100% { transform: translate(20px, 80px) rotate(210deg) scale(0.76); opacity:0; }
}
@keyframes momijiDrift6 {
  0%   { transform: translate(0px, -10px) rotate(30deg) scale(1);   opacity:0; }
  8%   { opacity:0.9; }
  30%  { transform: translate(-5px, 20px) rotate(-20deg) scale(0.94); opacity:0.82; }
  60%  { transform: translate(-10px, 46px) rotate(-90deg) scale(0.86); opacity:0.68; }
  100% { transform: translate(-16px, 78px) rotate(-175deg) scale(0.76); opacity:0; }
}
@keyframes snowFall1 {
  0%   { transform: translate(0px,-5px) rotate(0deg);   opacity:0; }
  10%  { opacity:0.8; }
  100% { transform: translate(10px,55px) rotate(180deg);  opacity:0; }
}
@keyframes snowFall2 {
  0%   { transform: translate(0px,-3px) rotate(30deg);  opacity:0; }
  15%  { opacity:0.6; }
  100% { transform: translate(-8px,50px) rotate(-90deg); opacity:0; }
}
@keyframes snowFall3 {
  0%   { transform: translate(0px,-6px) rotate(-20deg); opacity:0; }
  12%  { opacity:0.7; }
  100% { transform: translate(14px,52px) rotate(120deg);  opacity:0; }
}
@keyframes snowFall4 {
  0%   { transform: translate(0px,-4px) rotate(15deg);  opacity:0; }
  20%  { opacity:0.5; }
  100% { transform: translate(-12px,48px) rotate(-150deg); opacity:0; }
}
`;

// Small normal leaf path — simple pointed oval
const SPRING_LEAF_PATH = "M0,-6 C2,-4 3,0 2,4 C1,6 -1,6 -2,4 C-3,0 -2,-4 0,-6 Z";
const SPRING_LEAVES = [
  { left:'38%', anim:'petalFall1', dur:'3.2s', delay:'0.0s', fill:'#5AA830', size:7, rot:15  },
  { left:'58%', anim:'petalFall2', dur:'4.1s', delay:'1.3s', fill:'#78C040', size:6, rot:-20 },
  { left:'28%', anim:'petalFall3', dur:'3.7s', delay:'2.4s', fill:'#4A9428', size:6, rot:35  },
  { left:'50%', anim:'petalFall4', dur:'4.8s', delay:'0.7s', fill:'#90C838', size:5, rot:-10 },
];

const SakuraPetals = () => (
  <div style={{ position:'absolute', top:0, right:0, width:68, height:60,
    pointerEvents:'none', overflow:'visible', zIndex:10 }}>
    <style>{PETAL_CSS}</style>
    {SPRING_LEAVES.map((l, i) => (
      <div key={i} style={{
        position:'absolute', top:4, left:l.left, opacity:0,
        animationName:l.anim, animationDuration:l.dur, animationDelay:l.delay,
        animationTimingFunction:'ease-in',
        animationIterationCount:'infinite', animationFillMode:'both',
      }}>
        <svg width={l.size} height={l.size+2} viewBox="-4 -7 8 14" overflow="visible">
          <path d={SPRING_LEAF_PATH} fill={l.fill} stroke="#2E6010"
            strokeWidth="0.5" opacity="0.88" transform={`rotate(${l.rot})`} />
          <line x1="0" y1="5" x2="0" y2="-5" stroke="#2E6010"
            strokeWidth="0.4" strokeLinecap="round" opacity="0.5"
            transform={`rotate(${l.rot})`} />
        </svg>
      </div>
    ))}
  </div>
);

// ─── SUMMER: Firework particles ───────────────────────────────────
// FireworkParticles stubbed — animation now self-contained inside FireworkIcon
const FIREWORK_PARTICLES = [];
const FireworkParticles = () => null;

// ─── AUTUMN: Falling momiji leaves (emoji, spring-petal style) ───
const MOMIJI_PARTICLES = [
  { left:'38%', anim:'momijiDrift1', dur:'3.4s', delay:'0.0s', emoji:'🍁', size:14 },
  { left:'58%', anim:'momijiDrift2', dur:'4.3s', delay:'1.2s', emoji:'🍂', size:11 },
  { left:'26%', anim:'momijiDrift3', dur:'3.9s', delay:'2.6s', emoji:'🍁', size:12 },
  { left:'70%', anim:'momijiDrift4', dur:'5.0s', delay:'0.6s', emoji:'🍂', size:10 },
  { left:'14%', anim:'momijiDrift5', dur:'4.6s', delay:'1.9s', emoji:'🍁', size:11 },
  { left:'84%', anim:'momijiDrift6', dur:'3.7s', delay:'3.1s', emoji:'🍂', size:9  },
];

const MomijiParticles = () => (
  <div style={{ position:'absolute', top:0, right:0, width:68, height:60,
    pointerEvents:'none', overflow:'visible', zIndex:10 }}>
    {MOMIJI_PARTICLES.map((p, i) => (
      <div key={i} style={{
        position:'absolute', top:4, left:p.left,
        fontSize:p.size, lineHeight:1, opacity:0,
        animationName:p.anim, animationDuration:p.dur, animationDelay:p.delay,
        animationTimingFunction:'ease-in',
        animationIterationCount:'infinite', animationFillMode:'both',
        userSelect:'none',
      }}>{p.emoji}</div>
    ))}
  </div>
);

// ─── WINTER: Falling snowflakes ───────────────────────────────────
// SnowParticles is now embedded inside SnowflakeIcon — kept as empty stub
// so SeasonParticles wrapper doesn't break
const SNOW_PARTICLES = [];
const SnowParticles = () => null;
// ─── SEASONAL PARTICLES WRAPPER ───────────────────────────────────
const SeasonParticles = () => {
  const season = getSeason();
  if (season === 'summer') return <FireworkParticles />;
  if (season === 'autumn') return <MomijiOverlay isVisible intensity="light" />;
  if (season === 'winter') return <SnowParticles />;
  return <SakuraPetals />; // spring
};
// Dynamic date badge for calendar nav icon
const CalIcon = () => {
  const now = new Date();
  const day = now.getDate();
  const mon = now.toLocaleString('en',{month:'short'}).toUpperCase();
  return (
    <div style={{ width:24, height:24, borderRadius:5, overflow:'hidden',
      display:'inline-flex', flexDirection:'column',
      border:'1.5px solid currentColor', flexShrink:0 }}>
      <div style={{ background:'currentColor', height:7,
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontSize:7, fontWeight:800, color:'#fff',
          letterSpacing:'0.04em', lineHeight:1 }}>{mon}</span>
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center',
        justifyContent:'center' }}>
        <span style={{ fontSize:11, fontWeight:800, color:'currentColor',
          lineHeight:1 }}>{day}</span>
      </div>
    </div>
  );
};

const NAV = [
  { key:'home',     icon:'🏠', label:'Home'     },
  { key:'calendar', icon:'cal', label:'Calendar'  },
  { key:'search',   icon:'🔍', label:'Search'    },
  { key:'settings', icon:'⚙️', label:'Settings'  },
];

// ─── DEV BYPASS ──────────────────────────────────────────────────
// Set to true to skip login during debugging.
// Set back to false before going live.
const DEV_BYPASS      = false; // ← set true to skip login during debugging
const DEV_BYPASS_NAME = 'Koksum';

// ─── APP ROOT ────────────────────────────────────────────────────

// ─── LOCATION SUMMARY MODAL ───────────────────────────────────────────────────
// ─── BUILD CALENDAR LOCATION MAP ─────────────────────────────────────────────
// Merges GPS records + flight inference + forward propagation of last known country.
// Returns { 'YYYY-MM-DD': { country_code, country_name, source } }
// source: 'gps' | 'flight' | 'inferred'
function buildCalendarLocationMap(userLocations, entries, userId) {
  if (!userId) return {};

  const today = fd(new Date());
  // Look 90 days into the future for flight inference
  const futureLimit = fd(new Date(Date.now() + 90 * 86400000));
  const map = {};

  // 1. Seed GPS-confirmed locations (highest priority)
  (userLocations[userId] || []).forEach(loc => {
    map[loc.date] = { country_code: loc.country_code, country_name: loc.country_name, source: 'gps' };
  });

  // 2. Flight inference — flights where this user is the traveller
  // NOTE: entries in state use 'userId' (camelCase) from addEntry stamp, not 'user_id'
  const getArrCountry = (e) => {
    if (e.arrCountry) return { code: e.arrCountry, name: e.arrCountryName || e.arrCountry };
    const iata = (e.arrCity || '').toUpperCase().slice(0, 3);
    const match = AIRPORT_DB.find(([code]) => code === iata);
    if (match) return { code: match[3], name: match[4] };
    return null;
  };

  const userFlights = entries
    .filter(e => {
      if (e.type !== 'flight' || !e.date) return false;
      if (!getArrCountry(e)) return false;
      // Check new travellers[] first, then fall back to legacy traveller string
      const entryOwner = e.userId || e.user_id;
      if (Array.isArray(e.travellers) && e.travellers.length > 0) {
        return e.travellers.includes(userId);
      }
      if (!e.traveller) return entryOwner === userId;
      return e.traveller === userId;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  userFlights.forEach(f => {
    const arr = getArrCountry(f);
    if (!arr) return;
    // Arrival country starts on the flight date
    if (!map[f.date] || map[f.date].source !== 'gps') {
      map[f.date] = {
        country_code: arr.code,
        country_name: arr.name,
        source: 'flight',
      };
    }
  });

  // 3. Propagation — fill gaps, past and future
  const anchors = Object.keys(map).sort();
  if (anchors.length === 0) return map;

  const addDay = (dateStr, n) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return fd(d);
  };

  // Fill between each pair of anchors (forward from each anchor)
  for (let i = 0; i < anchors.length - 1; i++) {
    const from    = anchors[i];
    const to      = anchors[i + 1];
    const fromEntry = map[from];
    let cur = new Date(from + 'T00:00:00');
    cur.setDate(cur.getDate() + 1);
    const toD = new Date(to + 'T00:00:00');
    while (cur < toD) {
      const ds = fd(cur);
      if (!map[ds]) map[ds] = { ...fromEntry, source: 'inferred' };
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Fill backward from earliest anchor using DEPARTURE country of first flight
  // e.g. before HND→SIN flight: show JP (departure), not SG (arrival)
  const firstAnchor = anchors[0];
  const firstFlight = userFlights[0]; // earliest flight, sorted above
  let backEntry;
  if (firstFlight) {
    // Use departure country if available
    const depIata = (firstFlight.depCity || '').toUpperCase().slice(0, 3);
    const depMatch = AIRPORT_DB.find(([code]) => code === depIata);
    const depCode = firstFlight.depCountry || (depMatch ? depMatch[3] : null);
    const depName = firstFlight.depCountryName || (depMatch ? depMatch[4] : depCode);
    if (depCode) {
      backEntry = { country_code: depCode, country_name: depName, source: 'inferred' };
    }
  }
  // Fall back to first anchor's country if no departure info
  if (!backEntry) backEntry = { ...map[firstAnchor], source: 'inferred' };

  const pastLimit = fd(new Date(Date.now() - 365 * 86400000));
  let bCur = new Date(firstAnchor + 'T00:00:00');
  bCur.setDate(bCur.getDate() - 1);
  while (fd(bCur) >= pastLimit) {
    const ds = fd(bCur);
    if (!map[ds]) map[ds] = backEntry;
    bCur.setDate(bCur.getDate() - 1);
  }

  // Fill forward from last anchor to futureLimit
  const lastAnchor = anchors[anchors.length - 1];
  const lastEntry  = map[lastAnchor];
  let fwd = new Date(lastAnchor + 'T00:00:00');
  fwd.setDate(fwd.getDate() + 1);
  while (fd(fwd) <= futureLimit) {
    const ds = fd(fwd);
    if (!map[ds]) map[ds] = { ...lastEntry, source: 'inferred' };
    fwd.setDate(fwd.getDate() + 1);
  }

  return map;
}

function LocationSummaryModal({ onClose, userLocations, entries, currentUserId, isAdmin, workspaceMembers }) {
  const C = useContext(ThemeContext);
  const [year, setYear] = useState(new Date().getFullYear());
  const [tab,  setTab]  = useState('me');
  const [mode, setMode] = useState('all');
  const [expandedCC, setExpandedCC] = useState(null); // drill-down country code

  const computeStats = (userId) => {
    const today    = fd(new Date());
    const yearStr  = String(year);
    const start    = yearStr + '-01-01';
    const end      = yearStr + '-12-31';

    // Use buildCalendarLocationMap for full GPS + flight + inferred data
    const fullMap = buildCalendarLocationMap(userLocations, entries, userId);

    // Filter to year range
    const locMap = {};
    Object.entries(fullMap).forEach(([date, loc]) => {
      if (date >= start && date <= end) {
        // mode filter: 'gps' = GPS only, 'all' = GPS + flight + inferred
        if (mode === 'gps' && loc.source !== 'gps') return;
        locMap[date] = loc;
      }
    });

    const counts = {};
    let totalKnown = 0;
    Object.values(locMap).forEach(loc => {
      if (!loc.country_code) return;
      const cc = loc.country_code;
      counts[cc] = counts[cc] || { country_name: loc.country_name || cc, days: 0, sources: new Set() };
      counts[cc].days++;
      counts[cc].sources.add(loc.source);
      totalKnown++;
    });
    const dpy = (year % 4 === 0) ? 366 : 365;
    const totalDays = year === new Date().getFullYear()
      ? Math.min(dpy, Math.ceil((new Date(today) - new Date(start + 'T00:00:00')) / 86400000) + 1)
      : dpy;
    return {
      countries: Object.entries(counts)
        .map(([cc, v]) => ({
          cc, ...v,
          pct: (totalKnown > 0 ? (v.days / totalKnown * 100).toFixed(1) : '0'),
        }))
        .sort((a, b) => b.days - a.days),
      totalKnown, totalDays,
    };
  };

  // Build member tab list: self + all workspace members
  const memberTabs = [
    { key: currentUserId, label: '👤 Mine' },
    ...((workspaceMembers||[])
      .filter(m => m.id !== currentUserId)
      .map(m => ({ key: m.id, label: `👤 ${m.name || 'Member'}` }))),
  ];
  // For 'others' traveller entries — aggregate by travellerName
  const otherNames = [...new Set(
    entries
      .filter(e => e.type === 'flight' && !e.cancelled && e.traveller === 'other' && e.travellerName)
      .map(e => e.travellerName)
  )];
  const allTabs = [
    ...memberTabs,
    ...otherNames.map(n => ({ key: 'other:'+n, label: `✈ ${n}` })),
  ];

  const activeTab = allTabs.find(t => t.key === tab) ? tab : currentUserId;

  // Compute stats: for 'other:Name' tabs, scan flight entries by travellerName
  const computeOtherStats = (travellerName) => {
    const yearStr  = String(year);
    const start    = yearStr + '-01-01';
    const end      = yearStr + '-12-31';
    const todayStr = fd(new Date());

    const getArrC = (f) => {
      if (f.arrCountry) return { code: f.arrCountry, name: f.arrCountryName || f.arrCountry };
      const iata = (f.arrCity || '').toUpperCase().slice(0, 3);
      const m = AIRPORT_DB.find(([c]) => c === iata);
      return m ? { code: m[3], name: m[4] } : null;
    };
    const getDepC = (f) => {
      if (f.depCountry) return { code: f.depCountry, name: f.depCountryName || f.depCountry };
      const iata = (f.depCity || '').toUpperCase().slice(0, 3);
      const m = AIRPORT_DB.find(([c]) => c === iata);
      return m ? { code: m[3], name: m[4] } : null;
    };

    // All flights for this traveller, all years (need full history for propagation)
    const flights = entries
      .filter(e => e.type === 'flight' && !e.cancelled && e.traveller === 'other' &&
        e.travellerName === travellerName && e.date && getArrC(e))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (flights.length === 0) return { countries: [], totalKnown: 0, totalDays: 0 };

    // Build day map with propagation
    const dayMap = {};
    flights.forEach(f => {
      const arr = getArrC(f);
      if (arr) dayMap[f.date] = { cc: arr.code, cn: arr.name };
    });

    const anchors = Object.keys(dayMap).sort();
    // Fill forward between anchors
    for (let i = 0; i < anchors.length - 1; i++) {
      const fe = dayMap[anchors[i]];
      let cur = new Date(anchors[i] + 'T00:00:00');
      cur.setDate(cur.getDate() + 1);
      const toD = new Date(anchors[i + 1] + 'T00:00:00');
      while (cur < toD) { const ds = fd(cur); if (!dayMap[ds]) dayMap[ds] = fe; cur.setDate(cur.getDate() + 1); }
    }
    // Fill forward from last anchor to today (or year end)
    const fwdLimit = todayStr < end ? todayStr : end;
    const lastFe = dayMap[anchors[anchors.length - 1]];
    let fwd = new Date(anchors[anchors.length - 1] + 'T00:00:00');
    fwd.setDate(fwd.getDate() + 1);
    while (fd(fwd) <= fwdLimit) { const ds = fd(fwd); if (!dayMap[ds]) dayMap[ds] = lastFe; fwd.setDate(fwd.getDate() + 1); }
    // Back-fill before first anchor using dep country
    const dep = getDepC(flights[0]);
    if (dep) {
      const pastLim = yearStr + '-01-01'; // only back-fill within the year
      let bCur = new Date(anchors[0] + 'T00:00:00');
      bCur.setDate(bCur.getDate() - 1);
      while (fd(bCur) >= pastLim) { const ds = fd(bCur); if (!dayMap[ds]) dayMap[ds] = { cc: dep.code, cn: dep.name }; bCur.setDate(bCur.getDate() - 1); }
    }

    // Count days within year range (past days only for current year)
    const counts = {};
    let totalKnown = 0;
    Object.entries(dayMap).forEach(([date, loc]) => {
      if (date < start || date > end) return;
      if (date > todayStr && year === new Date().getFullYear()) return;
      if (!loc.cc) return;
      counts[loc.cc] = counts[loc.cc] || { country_name: loc.cn || loc.cc, days: 0, sources: new Set() };
      counts[loc.cc].days++;
      counts[loc.cc].sources.add('flight');
      totalKnown++;
    });

    const dpy = year % 4 === 0 ? 366 : 365;
    const totalDays = year === new Date().getFullYear()
      ? Math.min(dpy, Math.ceil((new Date(todayStr) - new Date(start + 'T00:00:00')) / 86400000) + 1)
      : dpy;

    return {
      countries: Object.entries(counts)
        .map(([cc, v]) => ({ cc, ...v, pct: (totalKnown > 0 ? (v.days / totalKnown * 100).toFixed(1) : '0') }))
        .sort((a, b) => b.days - a.days),
      totalKnown, totalDays,
    };
  };

  const isOtherTab = activeTab.startsWith('other:');
  const stats = isOtherTab
    ? computeOtherStats(activeTab.slice(6))
    : computeStats(activeTab);

  const years = [new Date().getFullYear()-1, new Date().getFullYear(), new Date().getFullYear()+1];

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.65)',
      backdropFilter:'blur(6px)', display:'flex', alignItems:'flex-end', justifyContent:'center'
    }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:'100%', maxWidth:430, maxHeight:'85vh', background:C.bg,
        borderRadius:BR.modal+'px '+BR.modal+'px 0 0',
        padding:'0 0 32px', overflowY:'auto',
        boxShadow:'0 -8px 40px rgba(0,0,0,0.4)',
      }}>
        <div style={{ padding:'18px 20px 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h3 style={{ margin:0, fontSize:20, fontWeight:700, color:C.text }}>📍 Location Summary</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:C.muted, fontSize:24, cursor:'pointer' }}>✕</button>
        </div>

        <div style={{ padding:'12px 20px 4px', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          {years.map(y => (
            <button key={y} onClick={()=>setYear(y)} style={{
              padding:'6px 14px', borderRadius:BR.pill,
              border:`1.5px solid ${year===y?C.rose:C.border}`,
              background:year===y?C.rose:'transparent',
              color:year===y?'#fff':C.dim,
              fontFamily:'inherit', fontSize:13, fontWeight:600, cursor:'pointer',
            }}>{y}</button>
          ))}
          {/* GPS/All toggle — only meaningful for own profile tabs, not Others */}
          {!isOtherTab && (
            <button onClick={()=>setMode(m=>m==='all'?'gps':'all')} style={{
              padding:'6px 12px', borderRadius:BR.pill, marginLeft:'auto',
              border:`1.5px solid ${C.border}`,
              background:mode==='all'?C.elevated:'transparent',
              color:C.dim, fontFamily:'inherit', fontSize:12, fontWeight:600, cursor:'pointer',
            }}>{mode==='all'?'✈ + flights':'📍 GPS only'}</button>
          )}
        </div>

        {allTabs.length > 1 && (
          <div style={{ padding:'8px 20px 12px', display:'flex', gap:8, flexWrap:'wrap' }}>
            {allTabs.map(({key, label}) => (
              <button key={key} onClick={()=>setTab(key)} style={{
                padding:'7px 14px', borderRadius:BR.pill,
                border:`1.5px solid ${activeTab===key?C.rose:C.border}`,
                background:activeTab===key?C.rose:'transparent',
                color:activeTab===key?'#fff':C.dim,
                fontFamily:'inherit', fontSize:13, fontWeight:600, cursor:'pointer',
              }}>{label}</button>
            ))}
          </div>
        )}

        <div style={{ padding:'4px 20px' }}>
          {stats.countries.length === 0 ? (
            <p style={{ color:C.muted, textAlign:'center', padding:'32px 0', fontSize:15 }}>
              No location data for {year}.<br/>Enable GPS or add flights with airport details.
            </p>
          ) : stats.countries.map(({ cc, country_name, days, pct, sources }) => {
            const yearStr = String(year);
            const yStart = yearStr+'-01-01', yEnd = yearStr+'-12-31';
            const drillFlights = isOtherTab
              ? entries.filter(e => {
                  if (e.type!=='flight' || e.traveller!=='other' || e.travellerName!==activeTab.slice(6)) return false;
                  if (e.date<yStart || e.date>yEnd) return false;
                  const ac = e.arrCountry||(AIRPORT_DB.find(([a])=>a===(e.arrCity||'').toUpperCase())||[])[3];
                  const dc = e.depCountry||(AIRPORT_DB.find(([a])=>a===(e.depCity||'').toUpperCase())||[])[3];
                  return ac===cc || dc===cc;
                }).sort((a,b)=>a.date.localeCompare(b.date))
              : entries.filter(e => {
                  if (e.type!=='flight' || e.date<yStart || e.date>yEnd) return false;
                  const uid = activeTab;
                  const owner = e.userId||e.user_id;
                  const tvs = Array.isArray(e.travellers)&&e.travellers.length>0 ? e.travellers : null;
                  const isMine = tvs ? tvs.includes(uid) : (!e.traveller ? owner===uid : e.traveller===uid);
                  if (!isMine) return false;
                  const ac = e.arrCountry||(AIRPORT_DB.find(([a])=>a===(e.arrCity||'').toUpperCase())||[])[3];
                  const dc = e.depCountry||(AIRPORT_DB.find(([a])=>a===(e.depCity||'').toUpperCase())||[])[3];
                  return ac===cc || dc===cc;
                }).sort((a,b)=>a.date.localeCompare(b.date));

            return (
            <div key={cc} style={{ marginBottom:14 }}>
              <div onClick={()=>setExpandedCC(expandedCC===cc?null:cc)}
                style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4, cursor:'pointer' }}>
                <span style={{ fontSize:24, lineHeight:1 }}>{countryFlag(cc)}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8 }}>
                    <span style={{ fontSize:15, fontWeight:600, color:C.text, flex:1 }}>{country_name}</span>
                    <span style={{ fontSize:14, fontWeight:700, color:C.rose, whiteSpace:'nowrap' }}>
                      {days}d · {pct}%
                    </span>
                  </div>
                  <div style={{ marginTop:5, height:6, borderRadius:3, background:C.elevated, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:3, minWidth:4,
                      width:pct+'%',
                      background:`linear-gradient(90deg,${C.rose},${C.T})` }} />
                  </div>
                </div>
                <div style={{ display:'flex', gap:4, alignItems:'center', flexShrink:0 }}>
                  {[...sources].includes('gps')      && <span title="GPS verified"   style={{ fontSize:11, color:C.T }}>📍</span>}
                  {[...sources].includes('flight')   && <span title="From flights"   style={{ fontSize:11, color:C.F }}>✈</span>}
                  {[...sources].includes('inferred') && <span title="Estimated stay" style={{ fontSize:11, color:C.muted }}>~</span>}
                  <span style={{ fontSize:11, color:C.muted, marginLeft:2 }}>{expandedCC===cc?'▲':'▼'}</span>
                </div>
              </div>
              {expandedCC===cc && (
                <div style={{ margin:'4px 0 8px 34px', borderLeft:`2px solid ${C.rose}40`, paddingLeft:12 }}>
                  {drillFlights.length===0
                    ? <p style={{ fontSize:13, color:C.muted, margin:'4px 0' }}>No flights recorded for {year}.</p>
                    : drillFlights.map((f,i) => {
                        const ac = f.arrCountry||(AIRPORT_DB.find(([a])=>a===(f.arrCity||'').toUpperCase())||[])[3];
                        const isArr = ac===cc;
                        const tvs = Array.isArray(f.travellers)&&f.travellers.length>0 ? f.travellers : null;
                        const nmap = f.travellerNamesMap || {};
                        const names = tvs
                          ? tvs.map(t=>t==='other'?f.travellerName:(nmap[t]||(workspaceMembers||[]).find(m=>m.id===t)?.name||'')).filter(Boolean).join(', ')
                          : f.travellerName||null;
                        return (
                          <div key={i} style={{ display:'flex', alignItems:'center', gap:8,
                            padding:'6px 0', borderBottom:`1px solid ${C.border}25` }}>
                            <span style={{ fontSize:15 }}>{isArr?'🛬':'🛫'}</span>
                            <div style={{ flex:1 }}>
                              <span style={{ fontSize:14, fontWeight:600, color:C.text }}>
                                {f.depCity||'?'} → {f.arrCity||'?'}
                              </span>
                              {f.flightNum && <span style={{ fontSize:12, color:C.muted, marginLeft:6 }}>{f.flightNum}</span>}
                              <div style={{ fontSize:12, color:C.dim, marginTop:1 }}>
                                {f.date}{names ? ` · 👤 ${names}` : ''}
                              </div>
                            </div>
                            <span style={{ fontSize:11, fontWeight:700,
                              color:isArr?C.T:C.rose,
                              background:isArr?C.T+'18':C.rose+'18',
                              borderRadius:BR.pill, padding:'2px 7px' }}>
                              {isArr?'ARR':'DEP'}
                            </span>
                          </div>
                        );
                      })
                  }
                </div>
              )}
            </div>);
          })}
          <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12, marginTop:4,
            fontSize:13, color:C.muted, textAlign:'center' }}>
            {stats.totalKnown} of {stats.totalDays} days tracked in {year}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // ── Dark mode — active 9pm to 7am, checked every minute ──────
  // ── Theme mode: 'auto' | 'light' | 'dark' ────────────────────
  // auto = follows time (9pm–7am dark), light/dark = manual override
  // Persisted in localStorage so it survives page reloads
  const [themeMode, setThemeMode] = useState(() =>
    localStorage.getItem('kizuna_theme_mode') || 'auto'
  );
  const [autoDark, setAutoDark] = useState(() => isDarkHour());
  useEffect(() => {
    const tick = () => setAutoDark(isDarkHour());
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);
  const setTheme = (mode) => {
    setThemeMode(mode);
    localStorage.setItem('kizuna_theme_mode', mode);
  };
  const isDark = themeMode === 'dark' || (themeMode === 'auto' && autoDark);
  const C  = isDark ? C_DARK  : C_LIGHT;
  const SH = getSH(isDark);
  const TC = getTC(C);
  const AC = getAC(C);

  // ── Festive fireworks ─────────────────────────────────────────
  const [festiveTheme,    setFestiveTheme]    = useState(() => detectFestiveTheme());
  const [festiveVisible,  setFestiveVisible]  = useState(() => !!detectFestiveTheme());
  // Re-check at midnight in case app is left open across days
  useEffect(() => {
    const id = setInterval(() => {
      const t = detectFestiveTheme();
      setFestiveTheme(t);
      setFestiveVisible(!!t);
    }, 60000);
    return () => clearInterval(id);
  }, []);
  const [tab,          setTab]          = useState('home');

  // ── Listen for NAVIGATE_HOME message from service worker ─────
  // Fired when user taps the morning summary notification
  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type === 'NAVIGATE_HOME') setTab('home');
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, []);
  const [entries,      setEntries]      = useState([]);
  const [userLocations,  setUserLocations]  = useState({});       // {userId: [{date,country_code,country_name,source}]}
  const [showLocationSummary, setShowLocationSummary] = useState(false);
  const [showCalFlags,   setShowCalFlags]   = useState(() => localStorage.getItem('kizuna_cal_flags') !== 'false');

  // Listen for flag toggle events from CalendarTab
  useEffect(() => {
    const h = (e) => setShowCalFlags(e.detail);
    window.addEventListener('kizuna_flags_toggle', h);
    return () => window.removeEventListener('kizuna_flags_toggle', h);
  }, []);
  const [auditLog,     setAuditLog]     = useState([]);
  const [showAdd,      setShowAdd]      = useState(false);
  const [addDate,      setAddDate]      = useState(null);  // pre-fill date when opening from calendar
  const [editingEntry, setEditingEntry] = useState(null);
  const [syncStatus,   setSyncStatus]   = useState('loading');
  const [flightSyncCount, setFlightSyncCount] = useState(0); // how many flights being synced
  const [workspace,       setWorkspace]       = useState(null); // {id, name, ownerId, role, members}
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  // ── Location tracking ─────────────────────────────────────────
  // Load saved locations from Supabase — own rows always, plus workspace partner rows
  const loadUserLocations = async (uid) => {
    if (!supabaseConfigured || !uid) return;
    // Fetch own rows (always works via RLS)
    const { data: own } = await supabase.from('user_locations')
      .select('user_id,date,country_code,country_name,source')
      .eq('user_id', uid)
      .order('date', { ascending: true });
    // Fetch partner rows via workspace_member_locations view (or via service — see SQL)
    // Partners' rows are exposed via the partner_locations RLS policy added in SQL
    const { data: partner } = await supabase.from('user_locations')
      .select('user_id,date,country_code,country_name,source')
      .neq('user_id', uid)
      .order('date', { ascending: true });
    const all = [...(own || []), ...(partner || [])];
    const grouped = {};
    all.forEach(loc => {
      if (!grouped[loc.user_id]) grouped[loc.user_id] = [];
      grouped[loc.user_id].push(loc);
    });
    setUserLocations(grouped);
  };

  // GPS capture — once per day, non-blocking
  const captureGpsLocation = async (uid) => {
    if (!uid || !supabaseConfigured) return;
    const today = fd(new Date());
    const lastCapture = localStorage.getItem('kizuna_gps_date');
    if (lastCapture === today) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`,
          { headers: { 'Accept-Language': 'en', 'User-Agent': 'Kizuna-App' } }
        );
        const json = await res.json();
        const country_code = json.address?.country_code?.toUpperCase();
        const country_name = json.address?.country;
        if (!country_code) return;
        await supabase.from('user_locations').upsert({
          user_id: uid, date: today,
          country_code, country_name, source: 'gps',
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,date' });
        localStorage.setItem('kizuna_gps_date', today);
        setUserLocations(prev => {
          const existing = (prev[uid] || []).filter(l => l.date !== today);
          return { ...prev, [uid]: [...existing, { date:today, country_code, country_name, source:'gps' }] };
        });
      } catch (e) { /* silent — GPS is best-effort */ }
    }, () => {}, { timeout:8000, maximumAge:3600000 });
  };

  // ── Auth state ─────────────────────────────────────────────────
  const [user,        setUser]        = useState(null);
  const [authReady,   setAuthReady]   = useState(false);
  const [authEmail,   setAuthEmail]   = useState('');
  const [authPass,    setAuthPass]    = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError,   setAuthError]   = useState('');
  const [showPass,    setShowPass]    = useState(false);

  // ── Daily Quote ────────────────────────────────────────────────
  const [quoteData,     setQuoteData]     = useState(null);
  const [quoteLoading,  setQuoteLoading]  = useState(false);
  const [showQuote,     setShowQuote]     = useState(false);

  // ── User display name ──────────────────────────────────────────
  const [userName,   setUserName]   = useState('');
  const [nameInput,  setNameInput]  = useState('');
  const [nameReady,  setNameReady]  = useState(false);
  // Ref mirror — synchronous read for toggleDone / updateEntry
  const entriesRef = useRef(entries);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  // ── Step 1: Listen for auth state changes ──────────────────────
  useEffect(() => {
    // DEV BYPASS: skip auth entirely, go straight to app
    if (DEV_BYPASS) {
      setUser({ id: 'dev-bypass-user' });
      setUserName(DEV_BYPASS_NAME);
      setNameInput(DEV_BYPASS_NAME);
      setNameReady(true);
      setAuthReady(true);
      setSyncStatus('synced');
      setWorkspaceLoaded(true);
      setWorkspace({ id: 'dev-ws', name: 'Dev', ownerId: 'dev-bypass-user', role: 'admin', members: [] });
      return;
    }

    if (!supabase) { setAuthReady(true); return; }

    // On every app open: try to refresh the session silently.
    // With refresh token expiry set to max in Supabase dashboard,
    // this keeps the user logged in indefinitely — OTP only needed once per device.
    const initSession = async () => {
      try {
        const { data: { session: existing } } = await supabase.auth.getSession();
        if (existing?.user) {
          // Session found — refresh JWT silently (handles expired access tokens)
          try {
            const { data: { session: refreshed }, error: rErr } =
              await supabase.auth.refreshSession();
            if (!rErr && refreshed?.user) {
              setUser(refreshed.user);
            } else {
              setUser(existing.user); // refresh failed but existing session usable
            }
          } catch {
            setUser(existing.user); // network error — use existing session
          }
        } else {
          setUser(null); // no session — show login
        }
      } catch {
        setUser(null);
      } finally {
        setAuthReady(true);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // SIGNED_IN and TOKEN_REFRESHED both keep the user logged in
      // TOKEN_REFRESHED must NOT trigger a full data reload — only update the user object
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session?.user) setUser(prev => prev?.id === session.user.id ? prev : session.user);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Step 2: Load data — each piece independently so one failure never kills another ──
  const loadingRef = useRef(false);
  useEffect(() => {
    if (!authReady || !user) return;
    if (DEV_BYPASS) return; // dev mode: no DB calls, use empty state
    if (loadingRef.current) return;
    loadingRef.current = true;

    async function load() {
      setSyncStatus('loading');

      // ① Entries — critical. If this fails, show sync error.
      let loadedEntries = [];
      try {
        loadedEntries = await dbLoadEntries(user.id);
        setEntries(loadedEntries);
        setSyncStatus('synced');
        loadUserLocations(user.id);
        captureGpsLocation(user.id);
      } catch (err) {
        console.warn('entries load failed:', err.message);
        setSyncStatus('error');
      }

      // ② Name — non-critical. Never triggers sync error.
      try {
        const loadedName = await dbLoadName(user.id);
        if (loadedName) {
          setUserName(loadedName);
          setNameInput(loadedName);
          setNameReady(true);
        }
      } catch (err) {
        console.warn('name load failed:', err.message);
        // Fall back to localStorage
        const cached = localStorage.getItem(`exec_user_v1_${user.id}`);
        if (cached) { setUserName(cached); setNameInput(cached); setNameReady(true); }
      }

      // ③ Audit log — non-critical.
      try {
        const loadedAudit = await dbLoadAudit(user.id);
        setAuditLog(loadedAudit);
      } catch { /* silently ignore */ }

      // ④ Workspace — non-critical.
      try {
        const ws = await dbLoadWorkspace(user.id);
        if (ws) {
          setWorkspace(ws);
          // F2: load shared entries from workspace members after workspace is known
          const memberIds = ws.members.map(m => m.id).filter(id => id !== user.id);
          if (memberIds.length > 0 && supabase) {
            try {
              const sharedResults = await Promise.all(
                memberIds.map(mid =>
                  supabase.from('entries').select('data')
                    .eq('user_id', mid)
                    .filter('data->>visibility','eq','shared')
                    .then(({ data }) => (data||[]).map(r=>r.data).filter(Boolean))
                )
              );
              const shared = sharedResults.flat();
              if (shared.length > 0) {
                setEntries(prev => {
                  const ids = new Set(prev.map(e => e.id));
                  return [...prev, ...shared.filter(e => e?.id && !ids.has(e.id))];
                });
              }
            } catch { /* shared entries non-critical */ }
          }
        }
      } catch { /* silently ignore */ }
      setWorkspaceLoaded(true);

      loadingRef.current = false;
    }

    load();
  }, [authReady, user]);

  // ── Step 3: Real-time — own entries + shared entries from workspace ──
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`kizuna-${user.id}`)
      // Own entries — all changes
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'entries', filter: `user_id=eq.${user.id}` },
        payload => {
          if (payload.eventType === 'DELETE') {
            setEntries(prev => prev.filter(e => e.id !== payload.old.id));
          } else if (payload.new?.data) {
            const incoming = payload.new.data;
            setEntries(prev => {
              const exists = prev.find(e => e.id === incoming.id);
              return exists
                ? prev.map(e => e.id === incoming.id ? incoming : e)
                : [...prev, incoming];
            });
          }
        })
      // Own audit log
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_log', filter: `user_id=eq.${user.id}` },
        payload => {
          if (payload.new?.data) {
            setAuditLog(prev => [...prev, payload.new.data].slice(-200));
          }
        })
      .subscribe();

    // Also subscribe to shared entries from each workspace member
    const memberChannels = (workspace?.members || [])
      .filter(m => m.id !== user.id)
      .map(m => supabase
        .channel(`kizuna-shared-${m.id}-${user.id}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'entries', filter: `user_id=eq.${m.id}` },
          payload => {
            // Only show if visibility is shared
            const entry = payload.new?.data || payload.old;
            if (!entry) return;
            if (payload.eventType === 'DELETE') {
              setEntries(prev => prev.filter(e => e.id !== payload.old.id));
            } else if (payload.new?.data?.visibility === 'shared') {
              const incoming = payload.new.data;
              setEntries(prev => {
                const exists = prev.find(e => e.id === incoming.id);
                return exists
                  ? prev.map(e => e.id === incoming.id ? incoming : e)
                  : [...prev, incoming];
              });
            } else if (payload.eventType === 'UPDATE' && payload.new?.data?.visibility !== 'shared') {
              // Entry was changed to private — remove from our view
              setEntries(prev => prev.filter(e =>
                !(e.id === payload.new.data.id && e.userId !== user.id)
              ));
            }
          })
        .subscribe()
      );

    return () => {
      supabase.removeChannel(channel);
      memberChannels.forEach(c => supabase.removeChannel(c));
    };
  }, [user, workspace]);

  // ── Auth actions ───────────────────────────────────────────────
  // ── Passphrase login ───────────────────────────────────────────
  const passphraseLogin = async () => {
    const trimEmail = authEmail.trim().toLowerCase();
    const trimPass  = authPass.trim();
    if (!trimEmail) { setAuthError('Please enter your email.'); return; }
    if (!trimPass)  { setAuthError('Please enter your passphrase.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimEmail)) {
      setAuthError('Please enter a valid email address.'); return;
    }

    setAuthLoading(true); setAuthError('');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY;

      // ① Call Edge Function — verifies passphrase server-side
      const res = await fetch(`${supabaseUrl}/functions/v1/kizuna-auth`, {
        method:  'POST',
        headers: { 'Content-Type':'application/json',
                   'Authorization':`Bearer ${anonKey}` },
        body:    JSON.stringify({ email: trimEmail, passphrase: trimPass }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setAuthError(data.error || 'Login failed. Please check your credentials.');
        setAuthLoading(false);
        return;
      }

      // ② Exchange token for session — use token_hash + type:'email'
      // Note: 'signup' and 'magiclink' types are deprecated in verifyOtp
      const { error: sessionErr } = await supabase.auth.verifyOtp({
        token_hash: data.token,
        type:       'email',
      });

      if (sessionErr) {
        setAuthError('Session error. Please try again.');
        setAuthLoading(false);
        return;
      }

      // ③ Pre-fill display name from Edge Function response
      // Save to DB immediately so nameReady is set and name screen is skipped
      if (data.display_name) {
        setUserName(data.display_name);
        setNameInput(data.display_name);
        setNameReady(true);
        // Also persist to DB so cross-device sync works
        try { await dbSaveName(data.email, data.display_name); } catch { /* non-critical */ }
      }
      // onAuthStateChange fires → setUser → app loads
    } catch {
      setAuthError('Connection error. Please check your network and try again.');
      setAuthLoading(false);
    }
  };

  const signOut = async () => {
    const uid = user?.id;
    await supabase.auth.signOut();
    // Reset all state — order matters
    setUser(null); setEntries([]); setAuditLog([]);
    setWorkspace(null); setWorkspaceLoaded(false);
    setUserName(''); setNameInput(''); setNameReady(false);
    setAuthEmail(''); setAuthPass(''); setAuthError('');
    setSyncStatus('loading');
    loadingRef.current = false; // allow data reload on next login
    if (uid) localStorage.removeItem(`exec_user_v1_${uid}`);
    localStorage.removeItem('exec_user_v1');
  };

  // ── Name save ──────────────────────────────────────────────────
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaveError, setNameSaveError] = useState('');
  const saveUserName = async () => {
    const n = nameInput.trim();
    if (!n || !user || nameSaving) return;
    setNameSaving(true); setNameSaveError('');
    try {
      await dbSaveName(user.id, n);
      setUserName(n);
      setNameReady(true); // only set after confirmed DB write
    } catch {
      setNameSaveError('Could not save name. Please check your connection and try again.');
    } finally {
      setNameSaving(false);
    }
  };

  // ── Audit helper ───────────────────────────────────────────────
  const logAudit = useCallback((action, entry, changes = null) => {
    if (!user) return;
    const event = {
      id:         `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      timestamp:  new Date().toISOString(),
      actor:      userName || 'You',
      action, entryId: entry.id, entryType: entry.type, entryTitle: entry.title, changes,
    };
    setAuditLog(prev => [...prev, event]);
    dbAppendAudit(user.id, event);
  }, [user, userName]);

  // ── Entry mutations ────────────────────────────────────────────
  // ── Manual flight sync — called only when user presses the refresh button ──
  const syncAllFlights = useCallback(async () => {
    const upcoming = entries.filter(e =>
      e.type === 'flight' && e.flightNum && e.date >= fd(new Date())
    );
    if (upcoming.length === 0) return;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return;

    const syncFlight = async (e, delay) => {
      await new Promise(r => setTimeout(r, delay));
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/flight-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
          body: JSON.stringify({ flightNumber: e.flightNum, date: e.date }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.error || !data?.label) return;
        const updated = { ...e };
        if (data.terminal)            updated.terminal    = data.terminal;
        if (data.gate)                updated.gate        = data.gate;
        if (data.airline)             updated.airline     = data.airlineName || e.airline;
        if (data.delayMins !== undefined) {
          updated.delayMins  = data.delayMins;
          updated.delayLabel = data.delayLabel;
        }
        if (data.revisedDep)          updated.revisedDep  = data.revisedDep;
        if (data.scheduledArr)        updated.scheduledArr = data.scheduledArr;
        setEntries(prev => prev.map(x => x.id === e.id ? updated : x));
        const ownerUserId = e.userId || user?.id;
        if (ownerUserId) dbUpsertEntry(ownerUserId, updated);
      } catch { /* silent */ }
    };

    setFlightSyncCount(upcoming.length);
    upcoming.forEach((e, i) => syncFlight(e, i * 1500).finally(() => {
      setFlightSyncCount(prev => Math.max(0, prev - 1));
    }));
  }, [entries, user]); // eslint-disable-line react-hooks/exhaustive-deps
  // Fires once per TIME SLOT (morning/afternoon/evening).
  // useRef stores the last slot shown — prevents re-firing within same slot.
  const quoteFiredRef = useRef('');
  useEffect(() => {
    if (!user || !nameReady) return;
    const currentSlot = getSlotKey();
    if (quoteFiredRef.current === currentSlot) return; // already shown this slot
    quoteFiredRef.current = currentSlot;
    try {
      const cached = JSON.parse(localStorage.getItem(QUOTE_CACHE_KEY) || 'null');
      if (cached?.slot === currentSlot && cached?.quote) {
        setQuoteData(cached);
        setShowQuote(true);
        return;
      }
    } catch { /* ignore */ }
    setQuoteLoading(true);
    setShowQuote(true);
    fetchDailyQuote(supabase).then(result => {
      if (result) setQuoteData(result);
      setQuoteLoading(false);
    });
  }, [user, nameReady]); // eslint-disable-line react-hooks/exhaustive-deps
  const addEntry = useCallback(e => {
    // Stamp userId AND userName so shared readers see who created it
    const stamped = { ...e, userId: user?.id, userName };
    setEntries(prev => [...prev, stamped]);
    logAudit('created', stamped);
    if (user) dbUpsertEntry(user.id, stamped);
  }, [logAudit, user, userName]);

  const toggleDone = useCallback(id => {
    const current = entriesRef.current.find(e => e.id === id);
    if (!current) return;
    if (current.userId && current.userId !== user?.id) return;
    const willComplete = !current.done;
    const updated = {
      ...current,
      done: willComplete,
      doneAt: willComplete ? new Date().toISOString() : null,
    };
    setEntries(prev => prev.map(e => e.id === id ? updated : e));
    logAudit(willComplete ? 'completed' : 'reopened', current);
    if (user) dbUpsertEntry(user.id, updated);
  }, [logAudit, user]);

  const toggleCancel = useCallback((id, isAdminAction=false) => {
    const current = entriesRef.current.find(e => e.id === id);
    if (!current) return;
    const isOwn = !current.userId || current.userId === user?.id;
    // Allow own entries OR admin
    if (!isOwn && !isAdminAction) return;
    const willCancel = !current.cancelled;
    const updated = { ...current, cancelled: willCancel, done: willCancel ? false : current.done };
    setEntries(prev => prev.map(e => e.id === id ? updated : e));
    logAudit(willCancel ? 'updated' : 'reopened', current);
    const ownerUserId = current.userId || user?.id;
    if (ownerUserId) dbUpsertEntry(ownerUserId, updated, user?.id);
  }, [logAudit, user]);

  const updateEntry = useCallback(updated => {
    const original = entriesRef.current.find(e => e.id === updated.id);
    if (!original) return;
    const TRACKED = ['title','date','time','endTime','location','attendees','notes',
                     'priority','tags','message','airline','flightNum','depCity',
                     'arrCity','terminal','gate','seat','visibility'];
    const changes = TRACKED
      .filter(f => String(original[f] ?? '') !== String(updated[f] ?? ''))
      .map(f => ({ field:f, from:original[f], to:updated[f] }));
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
    logAudit('updated', updated, changes.length > 0 ? changes : null);
    setEditingEntry(null);
    // Always use the entry's original owner userId for the DB write.
    // Pass caller ID so admin writes use SECURITY DEFINER RPC to bypass RLS.
    const ownerUserId = original.userId || user?.id;
    if (ownerUserId) dbUpsertEntry(ownerUserId, updated, user?.id);
  }, [logAudit, user]);

  const deleteEntry = useCallback(id => {
    const current = entriesRef.current.find(e => e.id === id);
    if (!current) return;
    setEntries(prev => prev.filter(e => e.id !== id));
    logAudit('deleted', current);
    // Use the entry owner's userId so admin deletes the correct row
    const ownerUserId = current.userId || user?.id;
    if (ownerUserId) dbDeleteEntry(ownerUserId, id);
  }, [logAudit, user]);

  const resetData = useCallback(async () => {
    // F15: clear UI immediately — no flash of old data
    setEntries([]); setAuditLog([]);
    setSyncStatus('loading');
    if (user) await dbResetUser(user.id);
    setSyncStatus('synced');
  }, [user]);

  const syncColor = syncStatus==='synced' ? C.T : syncStatus==='error' ? WARN : C.rose;

  // isAdmin — derived from workspace state, used by all tabs
  const isAdmin = workspaceLoaded && (workspace?.role === 'admin' || workspace?.ownerId === user?.id);

  // Expand repeating entries for display — virtual copies for next 365 days
  // All tabs receive expandedEntries so repeating birthdays/events appear everywhere
  const expandedEntries = useMemo(() => expandRepeating(entries), [entries]);

  const sharedStyle = {
    wrapper: { width:'100%', maxWidth:430, margin:'0 auto', height:'100vh',
      background:C.bg, display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'center', padding:'0 32px', boxSizing:'border-box',
      fontFamily:`'Nunito','DM Sans',system-ui,sans-serif` },
    googleFont: `
      @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Cormorant+Garamond:ital,wght@0,600;1,400&display=swap');
      input[type=number]::-webkit-inner-spin-button,
      input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
      input[type=number] { -moz-appearance:textfield; }
    `
  };

  // ── Auth screens ───────────────────────────────────────────────

  // Guard: show setup instructions if Supabase isn't configured
  if (!supabaseConfigured) {
    return (
      <div style={sharedStyle.wrapper}>
        <style>{sharedStyle.googleFont}</style>
        <p style={{ fontSize:36, margin:'0 0 16px' }}>⚙️</p>
        <h2 style={{ margin:'0 0 12px', fontSize:22, fontWeight:700, color:C.text,
          textAlign:'center', fontFamily:'Cormorant Garamond,serif' }}>
          Supabase not configured
        </h2>
        <p style={{ fontSize:15, color:C.dim, textAlign:'center', lineHeight:1.7, margin:0 }}>
          Add these two secrets to your GitHub repo:<br/>
          <strong style={{ color:C.text }}>VITE_SUPABASE_URL</strong><br/>
          <strong style={{ color:C.text }}>VITE_SUPABASE_ANON_KEY</strong>
        </p>
        <p style={{ fontSize:13, color:C.muted, textAlign:'center', marginTop:16, lineHeight:1.6 }}>
          Settings → Secrets → Actions → New repository secret
        </p>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div style={sharedStyle.wrapper}>
        <style>{sharedStyle.googleFont}</style>
        <SeasonIcon />
        <p style={{ marginTop:16, fontSize:15, color:C.dim, fontStyle:'italic',
          fontFamily:'Cormorant Garamond,serif' }}>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={sharedStyle.wrapper}>
        <style>{sharedStyle.googleFont}</style>
        <div style={{ marginBottom:20 }}><SeasonIcon /></div>
        <h1 style={{ margin:'0 0 6px', fontSize:34, fontWeight:600, color:C.text,
          fontFamily:'Cormorant Garamond,serif', textAlign:'center' }}>
          Kizuna&thinsp;絆
        </h1>
        <p style={{ margin:'0 0 36px', fontSize:14, color:C.dim, fontStyle:'italic',
          fontFamily:'Cormorant Garamond,serif', textAlign:'center', lineHeight:1.6 }}>
          Bonding with trust, loyalty & love —<br/>
          nurturing the invisible thread that connects hearts
        </p>

        {/* Email */}
        <p style={{ margin:'0 0 8px', fontSize:16, color:C.text, fontWeight:600,
          alignSelf:'flex-start' }}>Email</p>
        <input
          value={authEmail}
          onChange={e => setAuthEmail(e.target.value)}
          onKeyDown={e => e.key==='Enter' && passphraseLogin()}
          placeholder="your@email.com"
          type="email"
          autoFocus
          style={{ width:'100%', boxSizing:'border-box', background:C.card,
            border:`1.5px solid ${C.border}`, borderRadius:BR.panel, padding:'16px 18px',
            fontSize:16, color:C.text, outline:'none', fontFamily:'inherit',
            boxShadow:SH.card, marginBottom:14 }}
        />

        {/* Password */}
        <p style={{ margin:'0 0 8px', fontSize:16, color:C.text, fontWeight:600,
          alignSelf:'flex-start' }}>Password</p>
        <div style={{ width:'100%', position:'relative', marginBottom: authError ? 8 : 20 }}>
          <input
            value={authPass}
            onChange={e => setAuthPass(e.target.value)}
            onKeyDown={e => e.key==='Enter' && passphraseLogin()}
            placeholder="Enter your password"
            type={showPass ? 'text' : 'password'}
            style={{ width:'100%', boxSizing:'border-box', background:C.card,
              border:`1.5px solid ${C.border}`, borderRadius:BR.panel, padding:'16px 18px',
              paddingRight:52, fontSize:16, color:C.text, outline:'none',
              fontFamily:'inherit', boxShadow:SH.card }}
          />
          <button onClick={() => setShowPass(p => !p)}
            style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)',
              background:'transparent', border:'none', cursor:'pointer',
              fontSize:18, color:C.muted, padding:4 }}>
            {showPass ? '🙈' : '👁️'}
          </button>
        </div>

        {authError && (
          <p style={{ margin:'0 0 14px', fontSize:13, color:WARN,
            alignSelf:'flex-start' }}>{authError}</p>
        )}

        <button onClick={passphraseLogin} disabled={authLoading}
          style={{ width:'100%', background:`linear-gradient(135deg,${C.rose},${C.roseL})`,
            border:'none', borderRadius:BR.panel, padding:'18px',
            fontSize:18, fontWeight:700, color:'#fff', cursor:'pointer',
            fontFamily:'inherit', boxShadow:`0 6px 24px ${C.rose}45`,
            opacity: authLoading ? 0.7 : 1 }}>
          {authLoading ? 'Signing in…' : 'Enter Kizuna 🌸'}
        </button>
      </div>
    );
  }

  // ── Name setup screen (first time after sign-in) ───────────────
  if (!nameReady) {
    return (
      <div style={sharedStyle.wrapper}>
        <style>{sharedStyle.googleFont}</style>
        <div style={{ marginBottom:20 }}><SeasonIcon /></div>
        <h1 style={{ margin:'0 0 6px', fontSize:34, fontWeight:600, color:C.text,
          fontFamily:'Cormorant Garamond,serif', textAlign:'center' }}>
          Kizuna&thinsp;絆
        </h1>
        <p style={{ margin:'0 0 36px', fontSize:14, color:C.dim, fontStyle:'italic',
          fontFamily:'Cormorant Garamond,serif', textAlign:'center', lineHeight:1.6 }}>
          Bonding with trust, loyalty & love —<br/>
          nurturing the invisible thread that connects hearts
        </p>
        <p style={{ margin:'0 0 12px', fontSize:16, color:C.text, fontWeight:600, alignSelf:'flex-start' }}>
          What's your name?
        </p>
        <input
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onKeyDown={e => e.key==='Enter' && saveUserName()}
          placeholder="Enter your full name"
          autoFocus
          style={{ width:'100%', boxSizing:'border-box', background:C.card,
            border:`1.5px solid ${nameSaveError ? WARN : C.border}`, borderRadius:BR.panel, padding:'16px 18px',
            fontSize:16, color:C.text, outline:'none', fontFamily:'inherit',
            boxShadow:SH.card, marginBottom: nameSaveError ? 8 : 16 }}
        />
        {nameSaveError && (
          <p style={{ margin:'0 0 12px', fontSize:13, color:WARN, alignSelf:'flex-start' }}>
            {nameSaveError}
          </p>
        )}
        <button onClick={saveUserName} disabled={nameSaving}
          style={{ width:'100%', background:`linear-gradient(135deg,${C.rose},${C.roseL})`,
            border:'none', borderRadius:BR.panel, padding:'18px',
            fontSize:18, fontWeight:700, color:'#fff', cursor:'pointer',
            fontFamily:'inherit', boxShadow:`0 6px 24px ${C.rose}45`,
            opacity: nameSaving ? 0.7 : 1 }}>
          {nameSaving ? 'Saving…' : 'Enter Kizuna 🌸'}
        </button>
      </div>
    );
  }

  return (
    <WorkspaceContext.Provider value={workspace?.members || []}>
    <ThemeContext.Provider value={isDark ? C_DARK : C_LIGHT}>

    {showLocationSummary && (
      <LocationSummaryModal
        onClose={() => setShowLocationSummary(false)}
        userLocations={userLocations}
        entries={entries}
        currentUserId={user?.id}
        isAdmin={isAdmin}
        workspaceMembers={workspace?.members}
      />
    )}

    {/* ── Festive fireworks overlay (non-christmas only) ── */}
    {festiveTheme && festiveTheme !== 'christmas' && (
      <FestiveFireworks
        theme={festiveTheme}
        colorScheme={themeMode}
        isVisible={festiveVisible}
        onComplete={() => setFestiveVisible(false)}
      />
    )}

    <div style={{ width:'100%', maxWidth:430, margin:'0 auto', height:'100vh',
      background:C.bg, color:C.text,
      fontFamily:`'Nunito','DM Sans',system-ui,sans-serif`,
      display:'flex', flexDirection:'column', position:'relative', overflow:'hidden',
      WebkitFontSmoothing:'antialiased',
      transition:'background 0.4s, color 0.4s' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&display=swap');
        * { -webkit-tap-highlight-color: transparent; }
        input, select, textarea { font-family: 'Nunito', system-ui, sans-serif;
          background: ${C.card}; color: ${C.text}; transition: background 0.4s, color 0.4s; }
        input[type=date]::-webkit-calendar-picker-indicator,
        input[type=time]::-webkit-calendar-picker-indicator { filter: opacity(0.5) ${isDark ? 'invert(1)' : ''}; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        ::-webkit-scrollbar { width:3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius:2px; }
        ::placeholder { color: ${C.muted}; }
        button { font-family: 'Nunito', system-ui, sans-serif; }
        * { transition: background-color 0.4s, border-color 0.3s, color 0.3s; }
      `}</style>


      {/* ── Daily Quote Overlay ─────────────────────────────────── */}
      {showQuote && (
        <DailyQuoteScreen
          quoteData={quoteData}
          loading={quoteLoading}
          onDismiss={() => setShowQuote(false)}
        />
      )}

      {/* ── Main content ───────────────────────────────────────── */}
      <div style={{ flex:1, overflow:'hidden', position:'relative', background:C.bg }}>
        {tab==='home'     && <HomeTab     entries={expandedEntries} onToggle={toggleDone} onCancel={toggleCancel} onEdit={setEditingEntry} onDelete={deleteEntry} userName={userName} currentUserId={user?.id} onAdd={() => { setAddDate(null); setShowAdd(true); }} syncStatus={syncStatus} flightSyncCount={flightSyncCount} isAdmin={isAdmin} isDark={isDark} onLocationSummary={() => setShowLocationSummary(true)} />}
        {tab==='calendar' && <CalendarTab entries={expandedEntries} onToggle={toggleDone} onCancel={toggleCancel} onEdit={setEditingEntry} onDelete={deleteEntry} currentUserId={user?.id} onAdd={date => { setAddDate(date||null); setShowAdd(true); }} isAdmin={isAdmin} onSyncFlights={syncAllFlights} flightSyncCount={flightSyncCount} isDark={isDark} showFlags={showCalFlags} locationMap={buildCalendarLocationMap(userLocations, expandedEntries, user?.id)} />}
        {tab==='search'   && <SearchTab   entries={expandedEntries} onToggle={toggleDone} onCancel={toggleCancel} onEdit={setEditingEntry} onDelete={deleteEntry} currentUserId={user?.id} isAdmin={isAdmin} />}
        {tab==='settings' && <SettingsTab onReset={resetData} userName={userName} onChangeName={() => { setNameReady(false); setNameInput(userName); }} onSignOut={signOut} workspace={workspace} workspaceLoaded={workspaceLoaded} setWorkspace={setWorkspace} userId={user?.id} isDark={isDark} themeMode={themeMode} setTheme={setTheme} isAdmin={isAdmin} setFestiveTheme={setFestiveTheme} setFestiveVisible={setFestiveVisible} />}
        {showAdd      && <AddModal onClose={() => { setShowAdd(false); setAddDate(null); }} onSave={addEntry} initialDate={addDate} workspace={workspace} currentUserId={user?.id} onLocationRefresh={() => loadUserLocations(user?.id)} />}
        {editingEntry && <AddModal onClose={() => setEditingEntry(null)} onSave={updateEntry} editEntry={editingEntry} workspace={workspace} currentUserId={user?.id} onLocationRefresh={() => loadUserLocations(user?.id)} />}
      </div>

      {/* ── Bottom nav bar ─────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', height:72,
        borderTop:`1px solid ${C.border}`, background:C.card,
        flexShrink:0, paddingBottom:10,
        boxShadow:`0 -2px 16px rgba(44,38,32,0.08)` }}>

        {/* Home + Calendar */}
        {NAV.slice(0,2).map(n => (
          <button key={n.key} onClick={() => setTab(n.key)}
            style={{ flex:1, background: tab===n.key ? C.rose+'18' : 'transparent',
              border:'none', cursor:'pointer',
              display:'flex', flexDirection:'column', alignItems:'center', gap:4,
              padding:'8px 4px', borderRadius:BR.panel, margin:'0 4px',
              color: tab===n.key ? C.rose : C.muted,
              transition:'background 0.15s' }}>
            <span style={{ fontSize:24, color: tab===n.key ? C.rose : C.muted,
              display:'flex', alignItems:'center', height:24 }}>
              {n.icon === 'cal' ? <CalIcon /> : n.icon}
            </span>
            <span style={{ fontSize:12, fontWeight: tab===n.key ? 800 : 500,
              color: tab===n.key ? C.rose : C.muted }}>{n.label}</span>
          </button>
        ))}

        {/* V5: FAB — true circle, elevated with glow */}
        <button onClick={() => setShowAdd(true)}
          style={{ width:60, height:60, borderRadius:30, flexShrink:0,
            background:`linear-gradient(135deg,${C.rose},${C.roseL})`,
            border:'none',
            boxShadow:`0 6px 24px ${C.rose}60, 0 0 0 4px ${C.rose}20`,
            cursor:'pointer', display:'flex', alignItems:'center',
            justifyContent:'center', margin:'0 4px' }}>
          <span style={{ fontSize:28, color:'#fff', fontWeight:300, lineHeight:1, marginTop:-1 }}>+</span>
        </button>

        {/* Search + Settings */}
        {NAV.slice(2).map(n => (
          <button key={n.key} onClick={() => setTab(n.key)}
            style={{ flex:1, background: tab===n.key ? C.rose+'18' : 'transparent',
              border:'none', cursor:'pointer',
              display:'flex', flexDirection:'column', alignItems:'center', gap:4,
              padding:'8px 4px', borderRadius:BR.panel, margin:'0 4px',
              transition:'background 0.15s' }}>
            <span style={{ fontSize:24, color: tab===n.key ? C.rose : C.muted }}>{n.icon}</span>
            <span style={{ fontSize:12, fontWeight: tab===n.key ? 800 : 500,
              color: tab===n.key ? C.rose : C.muted }}>{n.label}</span>
          </button>
        ))}

      </div>
    </div>
    </ThemeContext.Provider>
    </WorkspaceContext.Provider>
  );
}
