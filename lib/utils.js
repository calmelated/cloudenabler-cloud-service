const prj = require('../project');
const math = require('mathjs');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const mbval = require(prj.LIB_PATH + '/mbval');
const servTZSec = (new Date().getTimezoneOffset() * 60);
const self = module.exports;

String.prototype.replaceAt = function(index, character) {
  index = parseInt(index);
  character = (typeof character === 'number') ? character.toString() : character ;
  return this.substr(0, index) + character + this.substr(index + character.length);
};

String.prototype.replaceAll = function(search, replacement) {
  let target = this;
  return target.replace(new RegExp(search, 'g'), replacement);
};

Array.prototype.uniqPush = function(val) {
  if(this.indexOf(val) < 0) {
    this.push(val);
  }
};

Array.prototype.uniqUnshift = (val) => {
  if(this.indexOf(val) < 0) {
    this.unshift(val);
  }
};

module.exports.sleep = (msec) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      return resolve();
    }, msec);
  });
};

/*
true cases:
has(undefined);     //undefined
has(null);          //null
has(NaN);           //not a number
has('');            //empty string

false cases:
has(false);         //boolean
has(true);          //boolean
has(0);             //number
has(5);             //number
has('aa');          //string
has({});            //object
has([]);            //array
has(() => {});      //function
*/
module.exports.has = (input) => {
  if(typeof input === 'undefined' || input === null || input === '') { 
    return false;
  } else if((input + '') === 'NaN') {
    return false;
  }
  return true;
};

module.exports.isNone = (input) => {
  return !self.has(input);
};

module.exports.isInputChecked = (input) => {
  if (input === 'on' || input === 'true' || input === '1') {
    return 1;
  } else if(input === '2') { // super admin
    return 1; //  Not allow
  } else {
    return 0;
  }
};

module.exports.toBytes = (data, size) => {
  let bufArray = new Uint8Array(size);
  let idx = size - 1;
  for (;;) {
    if (idx < 0 || data === 0) {
      break;
    }
    //console.log('0x' + (data & 0xff).toString(16));
    bufArray[idx--] = '0x' + (data & 0xff).toString(16);
    data = data >> 8;
  }
  return bufArray;
};

module.exports.padZero = (num, size) => {
  let s = num + '';
  if(s.length > size) {
    s = s.substr(0, size);
  } else {
    while (s.length < size) {
      s = '0' + s;
    }    
  }
  return s;
};

module.exports.hexToInt64 = (hex) => {
  hex = hex.replace(/^0x/i, '');
  let neg = parseInt(hex.substr(hex.length - 14, 1), 16);    
  let sign = (isNaN(neg) || (neg & 0x1) === 0) ? 1 : -1;

  const maxVal = 4503599627370495; 
  hex = (hex.length > 12) ?  hex.substr(hex.length - 13, 13) : hex ;
  let num = parseInt(hex, 16);
  if (sign < 0) { // negative value
    num = num - maxVal - 1;
  }
  return num;
};

module.exports.hexToInt = (hex) => {
  hex = hex.replace(/^0x/i, '');
  if (hex.length % 2 !== 0) {
    hex = "0" + hex;
  }
  let num = parseInt(hex, 16);
  let maxVal = Math.pow(2, hex.length / 2 * 8);
  if (num > maxVal / 2 - 1) {
    num = num - maxVal;
  }
  return num;
};

// (40001, 40004) -> [40001, 40002, 40003, 40004]
// (40004, 40001) -> [40004, 40003, 40002, 40001]
module.exports.getContiAddrs = (haddr, laddr) => {
  let _haddr = parseInt(haddr);
  let _laddr = parseInt(laddr);                    
  let ret = [];
  if(_haddr < _laddr) { // big endian
    for(let addr = _haddr; addr <= _laddr; addr++) {
      ret.push(addr);
    } 
  } else {
    for(let addr = _haddr; addr >= _laddr; addr--) {
      ret.push(addr);
    } 
  } 
  return ret;
};

module.exports.calChkSum = (pktAction, pktLen, pktId, size) => {
  let sum = 0;
  let buf = Buffer.concat([pktAction, pktLen, pktId]);
  for (let i = 0; i < buf.length; i++) {
    //console.log(buf.readUInt8(i));
    sum += buf.readUInt8(i);
  }
  return self.toBytes(sum, size);
};

module.exports.mac2hex = (mac) => {
  if(mac && mac.length === 17) { // 11:22:33:44:55:66 or 11-22-33-44-55-66
    mac = mac.toLowerCase();
    let macs = mac.split(':');
    macs = (macs.length === 1) ? mac.split('-') : macs;
    if(macs.length === 1) {
      dbg('invalid mac address! ' + mac);
      return mac; // error
    }
    return macs[0] + macs[1] + macs[2] + macs[3] + macs[4] + macs[5];
  } else {
    dbg('invalid mac address! ' + mac);
    return mac; // error
  }
};

// aabbccddeeff -> aa:bb:cc:dd:ee:ff
module.exports.hex2mac = (mac) => {
  if(mac && mac.length === 12) {
    return (mac[0] + mac[1] + ':' + mac[2] + mac[3] + ':' + mac[4] + mac[5]+ ':' + mac[6] + mac[7]+ ':' + mac[8] + mac[9]+ ':' + mac[10] + mac[11]).toLowerCase();
  } else {
    dbg('invalid mac address! ' + mac);
    return mac; // error
  }
};

// 1400001 - > 1, 400001
module.exports.getSlvId = (addr) => {
  return parseInt(addr / 1000000);
};

// 1400001 - > 400001
module.exports.getRealAddr = (addr) => {
  return addr.toString().substr(1, addr.length);
};

// fc-4, addr: 65536 -> fc-4, addr: 0xff
module.exports.getMbusAddr = (addr) => {
  return (parseInt(addr % 100000) - 1).toString(16);
};

module.exports.getFCode = (addr) => {
  let fcIdx = parseInt((addr / 100000) % 10);
  if(fcIdx === 0) {
    return '01';
  } else if(fcIdx === 1) {
    return '02';
  } else if(fcIdx === 3) {
    return '04';
  } else if(fcIdx === 4) {
    return '03';
  } else if(fcIdx === 5) { // write coil
    return '05';
  } else if(fcIdx ===6) { // write holding
    return '06';
  } else if(fcIdx === 7) { // write multi-holding
    return '16';
  } else if(fcIdx === 8) { // write multi-coils
    return '15';
  } else {
    return '';
  }
};

module.exports.valStr = (str) => {
  if(!str) {
    return false;
  } else if(str.match(/([\uD800-\uDBFF][\uDC00-\uDFFF])/g)){ // emoji
    return false;
  } else if(str.match(/['"\\]/g)) {
    return false;
  } else if(self.matchAttackStr(str)) {
    return false;
  }
  return true;
};

module.exports.matchAttackStr = (str) => {
  if(typeof str !== 'string') {
    return false;
  } else if(str.match(/(%3C%73%63%72%69%70%74%3E|%3Cscript%3E|<script>)/i)) { //  <scritp>
    info('Attack matched <script> : ' + str);
    return true;
  } else if(str.match(/(rm -[rf]|\/etc\/passwd|curl\shttp|wget\s+http|\/dev\/null|sh\s+\w*|dd if=|mkfs.\s+\/dev|init\s+[0-9])/i)) { // bad linux command
    info('Attack matched linux command: ' + str);
    return true;
  } else if(str.match(/\w*(%27|'|").*(truncate|delete|drop|or|and|union|select|;).*(\/\*|--|#)/ig)) { // typical Injection  "aaa ' or ... /*"
    info('Attack matched sql inject: ' + str);
    return true;
  } else if(str.match(/((\%3C)|<)[^\n]+((\%3E)|>)/i)) { //  looks for the opening HTML tag
    if(str.match(/<br>|<br\/>/i)) {
      return false; // ignore <br> and <br/>
    } else {
      info('Attack matched opening tag: ' + str);
      return true;
    }
  } else if(str.match(/((\%3C)|<)((\%2F)|\/)*[a-z0-9\%]+((\%3E)|>)/i)) { // CSS attack
    info('Attack matched CSS attack: ' + str);
    return true;
  } else if(str.match(/((\%3C)|<)((\%69)|i|(\%49))((\%6D)|m|(\%4D))((\%67)|g|(\%47))[^\n]+((\%3E)|>)/i)) { //<img src" CSS attack
    info('Attack matched CSS img attack: ' + str);
    return true; 
  }
  return false;
};

module.exports.clone = (obj, dbg) => {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    if(dbg) {
      info(dbg.__file + ':' + dbg.__line +
        '\nException:\n'   + e.stack);
    } else {
      info(e.stack);
    }
  }
  return;
};

module.exports.toJson = (jStr, dbg) => {
  if(!jStr) { 
    return; 
  } else if(jStr === '{}') {
    return {};
  }
  try {
    return JSON.parse(jStr);
  } catch (e) {
    if(dbg) {
      info(dbg.__file + ':' + dbg.__line +
        ((dbg.sn)        ? (' , sn: ' + dbg.sn) : '')  +
        ((dbg.company)   ? (' , company: ' + dbg.company) : '')  +
        ((dbg.companyId) ? (' , companyId: ' + dbg.companyId) : '')  +
        '\nJSON String:\n' + jStr +
        '\nException:\n'   + e.stack);
    } else {
      info(e.stack);
    }
  }
  return;
};

module.exports.toJsonStr = (json, dbg) => {
  if(!json) {
    return;
  }
  try {        
    return JSON.stringify(json);
  } catch (e) {
    if(dbg) {
      info(dbg.__file + ':' + dbg.__line +
        ((dbg.sn)        ? (' , sn: ' + dbg.sn) : '')  +
        ((dbg.company)   ? (' , company: ' + dbg.company) : '')  +
        ((dbg.companyId) ? (' , companyId: ' + dbg.companyId) : '')  +
        '\nException:\n' + e.stack);
    } else {
      info(e.stack);
    }
  }
  return;
};

module.exports.isJsonStr = (jStr) => {
  try {
    return JSON.parse(jStr);
  } catch (e) {
  }
  return;
};

module.exports.randPass = (length) => {
  let chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP1234567890";
  let pass = "";
  for (let x = 0; x < length; x++) {
    let i = Math.floor(Math.random() * chars.length);
    pass += chars.charAt(i);
  }
  return pass;
};

module.exports.toTimeString = (msec) => {
  let result = '';
  let sec = parseInt(msec / 1000);
  let d = new Date(null);
  let nday = 0;
  if(sec >= 86400) {
    nday = parseInt(sec / 86400);
    d.setSeconds((sec - nday * 86400));
    result = nday + 'd ' + d.toISOString().substr(11, 8);
  } else {
    d.setSeconds(sec);
    result = d.toISOString().substr(11, 8);
  }
  return result;
};

module.exports.logErrRequest = (req, res, err) => {
  // Request
  if(req.headers) {
    let reqIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    info('Error Reqest: ' + req.protocol + '://' + reqIp + req.url);
    if(req.headers.cookie) {
      info('Cookie: ' + req.headers.cookie);
    }
    if(req.session && req.session.user) {
      info('Company: ' + req.session.user.company + ' (Id: ' + req.session.user.companyId + '), Account: ' + req.session.user.account + ', Name: '+ req.session.user.name);
    }
  }
  if(req.body) {
    let bodys = Object.keys(req.body);
    let bodyStr = '';
    if(bodys.length > 0) {
      for(let i = 0; i < bodys.length; i++) {
        bodyStr += bodys[i] + '=' + req.body[bodys[i]] + '&';
      }
      info('Body: ' + bodyStr);
    }
  }
  if(err) {
    info(err);
  }
};

module.exports.vaildEmail = (email) => {
  if(!email) { return false; }
  return (email.match(/^[_A-Za-z0-9-\+]+(\.[_A-Za-z0-9-]+)*@[A-Za-z0-9-]+(\.[A-Za-z0-9]+)*(\.[A-Za-z]{2,})$/) !== null);
};

module.exports.strongPassword = (password) => {
  if(!password) { return false; }
  return (password.match(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])\w{6,}$/) !== null);
};

module.exports.vaildLength = (val, min, max) => {
  if(!val) { return false; }
  return self.vaildRange(val, min, max);
};

module.exports.vaildRange = (val, min, max) => {
  let _val = parseInt(val);
  return (val >= min && val <= max);
};

module.exports.vaildIp = (ip) => {
  if(!ip || ip === '0.0.0.0') {
    return false;
  }
  return (ip.match(/^(([01]?\d\d?|2[0-4]\d|25[0-5])\.){3}([01]?\d\d?|2[0-4]\d|25[0-5])$/) !== null);
};

module.exports.validMac = (mac) => {
  if(!mac) { return false; }
  return (mac.match(/^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/i) !== null);
};

module.exports.validMathEq = (eq) => {
  try {
    if(!eq.match(/x/ig)) {
      return false;
    }
    eq = eq.replace(/x|#\d{5,6}/ig, 1);
    //console.log('eq=' + eq);
    let ret = math.eval(eq);
    return (typeof ret !== 'undefined') ? true : false;
  } catch(e) {
    return false;
  }
};

module.exports.nTimeRange = (n, unit, time, tzSec) => {
  let trange = self.timeRange(unit, time, tzSec);
  let start = trange.start;
  let end = trange.end;
  for(let i = 1; i < n; i++) {
    trange = self.timeRange(unit, start - 60, tzSec);
    start  = trange.start;
  }
  return {start, end};
};

module.exports.timeRange = (unit, time, tzSec) => {
  tzSec = (tzSec) ? tzSec : 0;
  let start, end, year, month;
  if(unit === 'raw') {
    return {
      start: time - 3600 - (tzSec + servTZSec),
      end: time - (tzSec + servTZSec),
    };
  }

  time = new Date(time * 1000);
  if(unit === 'lastHour') { // 01:23 -> 000:00 - 01:00
    time.setMinutes(0);
    time.setSeconds(0);
    end = time.getTime();

    time.setHours(time.getHours() - 1);
    start = time.getTime();
  } else if(unit === 'hour') { // 01:23 -> 01:00 - 02:00
    time.setMinutes(0);
    time.setSeconds(0);
    start = time.getTime();

    time.setHours(time.getHours() + 1);
    end = time.getTime();
  } else if(unit === 'lastDay') { // 2016-03-04 01:23:00 -> 2016-03-03 00:00:00 ~ 2016-03-04 00:00:00
    time.setMinutes(0);
    time.setSeconds(0);
    time.setHours(0);
    end = time.getTime();

    time.setUTCDate(time.getUTCDate() - 1);
    start = time.getTime();
  } else if(unit === 'day') { // 2016-03-04 01:23:00 -> 2016-03-04 00:00:00 ~ 2016-03-05 00:00:00
    time.setMinutes(0);
    time.setSeconds(0);
    time.setHours(0);
    start = time.getTime();

    time.setUTCDate(time.getUTCDate() + 1);
    end = time.getTime();
  } else if(unit === 'lastWeek') {
    time.setMinutes(0);
    time.setSeconds(0);
    time.setHours(0);
    time.setUTCDate(time.getUTCDate() - 7);

    time.setUTCDate(time.getUTCDate() - ((time.getDay() === 0) ? 6 : (time.getDay() - 1)));
    start = time.getTime();
    time.setUTCDate(time.getUTCDate() + 7);
    end = time.getTime();
  } else if(unit === 'week') {
    time.setMinutes(0);
    time.setSeconds(0);
    time.setHours(0);

    time.setUTCDate(time.getUTCDate() - ((time.getDay() === 0) ? 6 : (time.getDay() - 1)));
    start = time.getTime();
    time.setUTCDate(time.getUTCDate() + 7);
    end = time.getTime();
  } else if(unit === 'lastMonth') {  //2016-03-04 01:23:00 -> 2016-02-01 00:00:00 ~ 2016-03-01 00:00:00
    year = time.getFullYear();
    month = time.getMonth();
    start = (new Date(year, month - 1, 1)).getTime();
    end = (new Date(year, month, 1)).getTime();
  } else if(unit === 'month') {  //2016-03-04 01:23:00 -> 2016-03-01 00:00:00 ~ 2016-04-01 00:00:00
    year = time.getFullYear();
    month = time.getMonth();
    start = (new Date(year, month, 1)).getTime();
    end = (new Date(year, month + 1, 1)).getTime();
  } else if(unit === 'lastYear') {
    year = time.getFullYear() - 1;
    start = (new Date(year, 0, 1)).getTime();
    end = (new Date(year + 1, 0, 1)).getTime();
  } else if(unit === 'year') {
    year = time.getFullYear();
    start = (new Date(year, 0, 1)).getTime();
    end = (new Date(year + 1, 0, 1)).getTime();
  }
  return {
    start: parseInt(start / 1000) - (tzSec + servTZSec),
    end: parseInt(end / 1000) - (tzSec + servTZSec),
  };
};
