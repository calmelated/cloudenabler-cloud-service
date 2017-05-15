const express = require('express');
const util = require('util');
const fs = require('fs');
const formidable = require('formidable');
const prj = require('../project');
const db = require(prj.DB_PATH);
const gstate = require(prj.GSTATE_PATH);
const router = express.Router();
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const utils = require(prj.LIB_PATH + '/utils');
const mac2hex = require(prj.LIB_PATH + '/utils').mac2hex;
const hex2mac = require(prj.LIB_PATH + '/utils').hex2mac;
const padZero = require(prj.LIB_PATH + '/utils').padZero;
const getSlvId = require(prj.LIB_PATH + '/utils').getSlvId;
const getFCode = require(prj.LIB_PATH + '/utils').getFCode;
const getMbusAddr = require(prj.LIB_PATH + '/utils').getMbusAddr;
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const csid = require(prj.LIB_PATH + '/csid');
const register = require(prj.LIB_PATH + '/register');
const ctrlblk = require(prj.LIB_PATH + '/ctrlblk');
const device = require(prj.LIB_PATH + '/device');
const mbval = require(prj.LIB_PATH + '/mbval');
const mcache = require(prj.LIB_PATH + '/mcache');
const alarm = require(prj.LIB_PATH + '/alarm');
const iosw = require(prj.LIB_PATH + '/iosw');
const iostlog = require(prj.LIB_PATH + '/iostlog');
const regular = require(prj.LIB_PATH + '/regular');
const iotype = require(prj.ROOT_PATH + '/public/js/iotype');
const isCommAlarm = require(prj.ROOT_PATH + '/public/js/iotype').isCommAlarm;
const isAppWRable = require(prj.ROOT_PATH + '/public/js/iotype').isAppWRable;
const isModbusWRable = require(prj.ROOT_PATH + '/public/js/iotype').isModbusWRable;
const ALMCODE = alarm.ALMCODE;

// Debug used
let lastDumpStr;
let dumpRegs = [];

const storeEvtLog = (devConf, events) => {
  if(!events) {
    return {err: gstate.NO_RECORD};
  }
  let qStr = '';
  let evts = events.split(',');
  let numEvts = evts[0];
  evts.shift();

  let pktLen = 32;
  for(let i = 0; i < numEvts ; i++) {
    let base = pktLen * i;
    let type  = '0x' + evts[base+0];
    let year  = (parseInt('0x' + evts[base+4]) + 1900);
    let month = (parseInt('0x' + evts[base+5]));
    let day   =  parseInt('0x' + evts[base+6]);
    let hours   = parseInt('0x' + evts[base+7]);
    let minutes = parseInt('0x' + evts[base+8]);
    let seconds = parseInt('0x' + evts[base+9]);
    let date = new Date(year, month, day, hours, minutes, seconds, 0);
    let evtSec = Math.round(date.getTime() / 1000);

    let stat, ver, extraMsg = '';
    if(!evtSec || type === '0x3C' || type === '0x3D' || type === '0x3E' || type === '0x46') {
      // extraMsg = JSON.stringify({
      //     failCnt: parseInt('0x' + evts[base+20] + evts[base+21] + evts[base+22] + evts[base+23]),
      //     successCnt: parseInt('0x' + evts[base+24] + evts[base+25] + evts[base+26] + evts[base+27])
      // });
      continue;
    } else if(type === '0x43') {
      stat = parseInt(evts[base+20]);
      extraMsg = {
        normal  : (stat === 0) ? true : false,
        writeErr: ((stat>>0) & 0x1 === 1) ? true : false,
        profErr : ((stat>>1) & 0x1 === 1) ? true : false,
        noUsbErr: ((stat>>2) & 0x1 === 1) ? true : false,
      };
      if(extraMsg.writeErr || extraMsg.noUsbErr) {
        alarm.send({
          dbsIdx: devConf.dbsIdx,
          companyId: devConf.companyId,
          sn: devConf.sn,
          type: 0, // only push message
          priority: 2,
          msgCode: ALMCODE.LOG_FAILED,
        });
      }
      extraMsg = JSON.stringify(extraMsg);
    } else if(type === '0x44' || type === '0x45') {
      let logArray = [];
      for(let j = 20; j < 31; j++) {
        logArray.push(parseInt(evts[base+j], 16));
      }
      stat = true;
      if(logArray[0] === 0x30) {
        stat = false;
        logArray[0] = 0x32;
      }
      extraMsg = JSON.stringify({
        success: stat,
        log: new Buffer(logArray).toString(),
      });
    } else if(type === '0x47') { // modbus master connect/disconnect
      let offline = (parseInt(evts[base+20]) === 1) ? true : false;
      extraMsg = JSON.stringify({offline});            
      alarm.send({
        dbsIdx: devConf.dbsIdx,
        companyId: devConf.companyId,
        sn: devConf.sn,
        type: 0, // only push message
        priority: (offline) ? 1 : 0,
        msgCode: (offline) ? ALMCODE.MBUS_MST_OFFLINE : ALMCODE.MBUS_MST_ONLINE,
      });
    }
    qStr += 'INSERT IGNORE INTO `' + db.TB_EVTLOG + '_' + devConf.sn + '` (`time`,`type`,`extraMsg`) VALUES (' + evtSec + ', UNHEX(\'' + evts[base+0] + '\'), \'' + extraMsg + '\'); ';
  }
  if(!qStr) { // empty query
    return {err: gstate.NO_RECORD};
  }

  let result = await(db.pr_wquery(devConf.dbsIdx, qStr));
  if (result.err) { info({__file, __line, err: result.err}); }
  return result;
};

const logEventData = (devConf, ctrlData, addr, val) => {
  if(devConf.enServLog !== 1) {
    return dbg('Cloud Logging is disabled!');
  } else if(!ctrlData[addr] || ctrlData[addr].enlog !== '1' || ctrlData[addr].haddr) {
    return dbg('Log the register is disabled!');
  } else if(!iotype.isEventData(ctrlData[addr].type)) {
    return dbg('No event/state data!');
  }
  let now = parseInt(Date.now() / 1000);
  let qStr = 'INSERT LOW_PRIORITY IGNORE INTO `' + db.DB_RLOG + '_' + devConf.sn + '`.`' + addr + '_raw` (`time`, `value`) VALUES (\'' + now + '\', 1);' ;
  let result = await(db.pr_wquery(devConf.dbsIdx, qStr));
  if (result.err) {
    info(result.err);
  }
};

// For YATEC/HYEC only
const ioStatusLog = (devConf, ctrlData, sn, addr, val) => {
  let slvIdx = getSlvId(addr);
  let slvName = (slvIdx > 0) ? (devConf.slvDev[slvIdx] ? ' -> ' + devConf.slvDev[slvIdx] : '') : '';
  await(iostlog.save({
    dbsIdx: devConf.dbsIdx,
    companyId: devConf.companyId,
    devName: devConf.name + slvName,
    rName: ctrlData[addr].desc,
    rVal: val,
    dt: ctrlData[addr].dt,
    sn: sn,
    addr: addr,
  }));
};

const calcMathEq = (req, addr, devConf, ctrlData, mbData) => {
  try {
    let type = ctrlData[addr].type;
    let eq = ctrlData[addr].eq;
    addr = parseInt(addr);
    let slvIdx = getSlvId(addr);

    let val = '0x';
    if(iotype.is64bit(ctrlData[addr].type)) {
      let iaddr = ctrlData[addr].iaddr;
      let jaddr = ctrlData[addr].jaddr;
      let laddr = ctrlData[addr].laddr;
      val += padZero(req.body[addr], 4);
      val += padZero(utils.isNone(req.body[iaddr]) ? mbData[iaddr] : req.body[iaddr], 4);
      val += padZero(utils.isNone(req.body[jaddr]) ? mbData[jaddr] : req.body[jaddr], 4);
      val += padZero(utils.isNone(req.body[laddr]) ? mbData[laddr] : req.body[laddr], 4);
    } else if(iotype.is48bit(ctrlData[addr].type)) {
      let iaddr = ctrlData[addr].iaddr;
      let laddr = ctrlData[addr].laddr;
      let conf  = {};
      conf.type = ctrlData[addr].type;
      conf.hval = req.body[addr];
      conf.ival = utils.isNone(req.body[iaddr]) ? mbData[iaddr] : req.body[iaddr];
      conf.lval = utils.isNone(req.body[laddr]) ? mbData[laddr] : req.body[laddr];
      conf.fpt  = ctrlData[addr].fpt;
      val = register.toDec48Val(conf);
    } else if(iotype.is32bit(ctrlData[addr].type)) {
      let laddr = ctrlData[addr].laddr;            
      val += padZero(req.body[addr], 4);
      val += padZero(utils.isNone(req.body[laddr]) ? mbData[laddr] : req.body[laddr], 4);
    } else { // 16bits
      val += padZero(req.body[addr], 4);
    }

    let fpt = 1;
    if(iotype.is48bit(ctrlData[addr].type)) {
      val = val; // do nothing 
    } else { // 16Bits, 32Bits, 64Bits
      if(iotype.is64bit(type)) { // 64bits signed fix-point 
        val = utils.hexToInt64(val);
      } else if(iotype.isSigned(type)) {
        val = utils.hexToInt(val);
      }
      if(ctrlData[addr].fpt){
        fpt = Math.pow(10, ctrlData[addr].fpt);
        val = '(' + val + '/' + fpt + ')';
      }
    }

    eq = eq.replace(/x/ig, val);
    let addrs = eq.match(/#\d{5,7}/ig);
    if(addrs) {
      for(let i = 0 ; i < addrs.length; i++) {
        let maddr = addrs[i].substr(1, addrs[i].length); // remove #
        maddr = (slvIdx > 0 && maddr.length === 6) ? (slvIdx + maddr) : maddr;
        if(!ctrlData[maddr]) {
          return dbg('no addr = ' + maddr); // no such register
        }

        let mval = '0x';
        if(iotype.is64bit(ctrlData[addr].type)) {
          let miaddr = ctrlData[maddr].iaddr;
          let mjaddr = ctrlData[maddr].jaddr;
          let mladdr = ctrlData[maddr].laddr;
          mval += padZero(utils.isNone(mbData[maddr])  ? 0 : mbData[maddr],  4);
          mval += padZero(utils.isNone(mbData[miaddr]) ? 0 : mbData[miaddr], 4);
          mval += padZero(utils.isNone(mbData[mjaddr]) ? 0 : mbData[mjaddr], 4);
          mval += padZero(utils.isNone(mbData[mladdr]) ? 0 : mbData[mladdr], 4);
          mval = utils.hexToInt64(mval);
        } else if(iotype.is48bit(ctrlData[maddr].type)) {
          let miaddr = ctrlData[maddr].iaddr;
          let mladdr = ctrlData[maddr].laddr;
          let conf  = {};
          conf.type = ctrlData[maddr].type;
          conf.hval = utils.isNone(mbData[maddr])  ? 0 : mbData[maddr];
          conf.ival = utils.isNone(mbData[miaddr]) ? 0 : mbData[miaddr];
          conf.lval = utils.isNone(mbData[mladdr]) ? 0 : mbData[mladdr];
          conf.fpt  = ctrlData[maddr].fpt;
          mval = register.toDec48Val(conf);
        } else if(iotype.is32bit(ctrlData[maddr].type)) {
          let mladdr = ctrlData[maddr].laddr;
          mval += padZero(utils.isNone(mbData[maddr])  ? 0 : mbData[maddr],  4);
          mval += padZero(utils.isNone(mbData[mladdr]) ? 0 : mbData[mladdr], 4);
        } else { //16bits
          mval += padZero(utils.isNone(mbData[maddr])  ? 0 : mbData[maddr], 4);
        }                
        // fix points 
        if(iotype.is48bit(ctrlData[maddr].type)) {
          mval = mval;
        } else { // 16, 32, 64 bits
          if(ctrlData[maddr].fpt) {
            mval = '(' + mval + '/' + Math.pow(10, ctrlData[maddr].fpt) + ')';
          }
        }
        // dbg('addr=' + addrs[i] + ', mval=' +mval);
        eq = eq.replaceAll(addrs[i], mval);
      }
    }
    let result;
    if(iotype.is48bit(ctrlData[addr].type)) {
      result = eval(eq);
    } else {
      result = parseInt(((eval(eq).toFixed(6)) * fpt).toFixed(6)); 
    }
    // dbg('eq = ' + eq + ', fpt: ' + fpt);
    // dbg('result = ' + result + ', result=0x' + parseInt(result, 16));

    if(iotype.is64bit(ctrlData[addr].type)) {
      if(result < 0) {
        result = 'fff' + padZero((0xfffffffffffff + result + 1).toString(16), 13);
      } else {
        result = padZero(result.toString(16), 16);
      }
      req.body[addr] = result.substr(0, 4);
      req.body[ctrlData[addr].iaddr] = result.substr(4, 4);
      req.body[ctrlData[addr].jaddr] = result.substr(8, 4);
      req.body[ctrlData[addr].laddr] = result.substr(12, 4);
    } else if(iotype.is48bit(ctrlData[addr].type)) {
      if(result > 999999.999) {
        result = 999999.999;
      } else if(result < 0) {
        result = 0;
      } 
      req.body[addr] = parseInt(result / 1000).toString(16);
      req.body[ctrlData[addr].iaddr] = (parseInt(result) % 1000).toString(16);
      req.body[ctrlData[addr].laddr] = (parseInt(result * 1000) % 1000).toString(16);
    } else if(iotype.is32bit(ctrlData[addr].type)) {
      result = padZero((result < 0) ? (result>>>0).toString(16) : result.toString(16), 8);
      req.body[addr] = result.substr(0, 4);
      req.body[ctrlData[addr].laddr] = result.substr(4, 4);
    } else {
      result = padZero((result < 0) ? (result>>>0).toString(16) : result.toString(16), 8);
      req.body[addr] = result.substr(4, 4);
    }
  } catch(e) {
    dbg(e.stack);
  }
};

const setDebugRegs = () => {
  let _dumpRegs = await(csid.get('C', 'DUMP_REGISTERS'));
  if(_dumpRegs === lastDumpStr) {
    return;
  } else {
    lastDumpStr = _dumpRegs;
  }
  dumpRegs = (_dumpRegs) ? _dumpRegs.split(',') : null;
};

const getRegVal = (req, sn, addr, ctrlData, mbData) => {
  let type = ctrlData[addr].type;
  let val = req.body[addr];
  let oldVal, newVal;
  if(iotype.is16bit(type)) {
    oldVal = register.toDec16Val({
      type: type,
      hval: mbData[addr],
      fpt: ctrlData[addr].fpt,
    });
    newVal = register.toDec16Val({
      type: type,
      hval: val,
      fpt: ctrlData[addr].fpt,
    });
    dbg('Old: ' + oldVal + ', New: ' + newVal + ', UT: ' + ctrlData[addr].up + ', LT: ' + ctrlData[addr].low);
    return [oldVal, newVal];
  } 

  // 32bits or 64bits
  let laddr = ctrlData[addr].laddr;
  if(iotype.is32bit(type) && laddr && utils.has(req.body[laddr])) {
    oldVal = register.toDec32Val({
      type: type,
      hval: mbData[addr],
      lval: mbData[laddr],
      fpt: ctrlData[addr].fpt,
    });
    newVal = register.toDec32Val({
      type: type,
      hval: val,
      lval: req.body[laddr],
      fpt: ctrlData[addr].fpt,
    });
  } else if(iotype.is48bit(type) && laddr && utils.has(req.body[laddr])){
    let iaddr = ctrlData[addr].iaddr;
    oldVal = register.toDec48Val({
      type: type,
      hval: mbData[addr],
      ival: mbData[iaddr],
      lval: mbData[laddr],
      fpt: ctrlData[addr].fpt,
    });
    newVal = register.toDec48Val({
      type: type,
      hval: val,
      ival: req.body[iaddr],
      lval: req.body[laddr],
      fpt: ctrlData[addr].fpt,
    });        
  } else if(iotype.is64bit(type) && laddr && utils.has(req.body[laddr])){
    let iaddr = ctrlData[addr].iaddr;
    let jaddr = ctrlData[addr].jaddr;
    oldVal = register.toDec64Val({
      type: type,
      hval: mbData[addr],
      ival: mbData[iaddr],
      jval: mbData[jaddr],
      lval: mbData[laddr],
      fpt: ctrlData[addr].fpt,
    });
    newVal = register.toDec64Val({
      type: type,
      hval: val,
      ival: req.body[iaddr],
      jval: req.body[jaddr],
      lval: req.body[laddr],
      fpt: ctrlData[addr].fpt,
    });
  } else {
    info(__file + ': '+ __line + ' unknown type! sn: ' + sn + ', haddr: '+ addr + ', laddr: ' + laddr);
  }
  // dbg('Old: ' + oldVal + ', New: ' + newVal + ', UT: ' + ctrlData[addr].up + ', LT: ' + ctrlData[addr].low);
  return [oldVal, newVal];
};

const sendBxAlarm = (bxType, sn, slvName, devConf) => {
  let msgCode = -1, priority = 0;
  if(!slvName) {
    return dbg('unknow slave deveice = ' + slvName);
  } else if(bxType === 'B0') { // Offline
    msgCode = ALMCODE.SLVDEV_OFFLINE;
    priority = 1;
  } else if(bxType === 'B1') { // Online
    msgCode = ALMCODE.SLVDEV_ONLINE;
  } else {
    return; // unknown type
  }
  await(alarm.send({
    dbsIdx: devConf.dbsIdx,
    companyId: devConf.companyId,
    sn: sn,
    type: 0, // push only
    priority: priority,
    msgCode: msgCode,
    extra: {slvName},
  }));
};

const sendAxAlarm = (axType, req, sn, addr, devConf, ctrlData, mbData) => {
  if(!ctrlData[addr]) {
    return dbg({__file, __line, err: 'No such register! addr=' + addr});
  } else if(!iotype.isMbusNumber(ctrlData[addr].type)) {
    return dbg({__file, __line, err: 'Not Modbus-Writeable! type=' + ctrlData[addr].type});
  } else if(!ctrlData[addr].dur) {
    return dbg({__file, __line, err: 'Alarm Duration should > 0, dur=' + ctrlData[addr].dur});
  }

  let almConf;
  let dbsIdx = devConf.dbsIdx;
  let type = ctrlData[addr].type;
  let msgCode = -1;
  if(axType === 'A0') { // Back to normal
    msgCode = ALMCODE.BACK_NORMAL_ALARM;
  } else if(axType === 'A1' && utils.has(ctrlData[addr].up)) { // Up-Bound
    msgCode = ALMCODE.UPPER_LIMIT_ALARM;
    almConf = ctrlData[addr].up;
  } else if(axType === 'A2' && utils.has(ctrlData[addr].low)) { // Low-Bound
    msgCode = ALMCODE.LOWER_LIMIT_ALARM;
    almConf = ctrlData[addr].low;
  } else {
    return dbg({__file, __line, err: 'Unknown type=' + type + ', up='+ ctrlData[addr].up + ', low=' + ctrlData[addr].low}); // unknown type
  }

  let priority = (ctrlData[addr].pri ? ctrlData[addr].pri : 0);
  let [oldVal, newVal] = getRegVal(req, sn, addr, ctrlData, mbData);
  let curVal = utils.has(newVal) ? newVal : oldVal; 
  regular.logAlarmData(dbsIdx, sn, addr, curVal);
  
  let almObj = {
    dbsIdx: dbsIdx,
    companyId: devConf.companyId,
    sn: sn,
    addr: addr,
    type: (ctrlData[addr].sam === '1') ? 2 : 0, // push + email or push
    priority: priority,
    msgCode: msgCode,
    extra: {
      sn: req.body.sn,
      desc: ctrlData[addr].desc,
      value: curVal,
      unit: (ctrlData[addr].unit ? ctrlData[addr].unit : ''),
    }
  };

  // Register config
  if(utils.has(almConf)) {
    almObj.extra.conf = almConf;            
  }
  
  // Send Register Values
  for(let rr of ['rr1','rr2','rr3','rr4']) {
    if(!ctrlData[addr][rr] || ctrlData[addr][rr] === 'null') {
      continue;
    }
    let _addr = ctrlData[addr][rr].split("-")[0];
    if(!ctrlData[_addr] || !ctrlData[_addr].desc) { // the register might be removed
      continue;
    }
    let devVal = await(register.toDecVal(dbsIdx, sn, _addr));
    almObj.extra[rr] = ctrlData[addr][rr];
    almObj.extra[rr + '_desc']  = ctrlData[_addr].desc;
    almObj.extra[rr + '_value'] = utils.has(devVal) ? devVal : '';
    almObj.extra[rr + '_unit']  = ctrlData[_addr].unit ? ctrlData[_addr].unit : '';
  }

  alarm.send(almObj);
};

const sendRegAlarm = (req, sn, addr, devConf, ctrlData, mbData) => {
  let companyId = devConf.companyId;
  let dbsIdx = devConf.dbsIdx;
  let type = ctrlData[addr].type;
  let val = req.body[addr];
  if(iotype.isCommAlarm(type)) {
    if(parseInt(val, 16) > 0 && (!mbData[addr] || parseInt(mbData[addr], 16) === 0)) {
      let alarmStr = ctrlData[addr].desc;
      let extra =  {
        sn: req.body.sn,
        addr: addr,
      };            
      if(ctrlData[addr].refReg && ctrlData[addr].refReg !== 'null') {
        let _addr = ctrlData[addr].refReg.split("-")[0];
        if(ctrlData[_addr] && ctrlData[_addr].desc) { // the register might be removed
          let unit = ctrlData[_addr].unit ? ctrlData[_addr].unit : '' ;
          let devVal = await(register.toDecVal(dbsIdx, sn, _addr));
          alarmStr = ctrlData[addr].desc + " (" + ctrlData[_addr].desc + ": " + (utils.has(devVal) ? (devVal + unit) : '') + ')';
          extra.refReg = (ctrlData[addr].refReg) ? ctrlData[addr].refReg : null ;
          extra.value = devVal;
          extra.unit = unit;
        }
      }
      alarm.send({
        dbsIdx: dbsIdx,
        companyId: companyId,
        sn: sn,
        addr: addr,
        type: (type % iotype.ALARM_GCM), // push or email
        priority: (ctrlData[addr].pri) ? ctrlData[addr].pri : 0,
        msgCode: ALMCODE.USER_DEFINED,
        message: alarmStr,
        extra: extra,
      });
    }
  }
  // The reset is for Modbus -> APP register only
  if(!iotype.isMbusNumber(type)) {
    return;
  }
  
  // Up/Low Alarm and IoStatlog  only
  let hasUp = utils.has(ctrlData[addr].up);
  let hasLow = utils.has(ctrlData[addr].low);
  if(!(hasUp || hasLow || ctrlData[addr].dt)) {
    return;
  }

  let [oldVal, newVal] = getRegVal(req, sn, addr, ctrlData, mbData);
  if(utils.isNone(newVal)) {
    return;
  }

  // For YATEC/HYEC I/O Stat Log --------------------------------------------------
  if(ctrlData[addr].dt && (newVal !== oldVal)) {
    await(ioStatusLog(devConf, ctrlData, sn, addr, newVal));
  }

  // Server UP/LOW Bound Alarm (Duration must be 0 or null)
  if(ctrlData[addr].dur) {
    return;
  }

  let almConf = '';
  let msgCode = 0;
  let priority = (ctrlData[addr].pri ? ctrlData[addr].pri : 0);
  if(hasUp && hasLow) {
    if(utils.isNone(mbData[addr]) && newVal >= ctrlData[addr].up) {
      msgCode = ALMCODE.UPPER_LIMIT_ALARM;
      almConf = ctrlData[addr].up;
    } else if(utils.isNone(mbData[addr]) && newVal <= ctrlData[addr].low) {
      msgCode = ALMCODE.LOWER_LIMIT_ALARM;
      almConf = ctrlData[addr].low;
    } else if(newVal >= ctrlData[addr].up && oldVal < ctrlData[addr].up) {
      msgCode = ALMCODE.UPPER_LIMIT_ALARM;
      almConf = ctrlData[addr].up;
    } else if(newVal <= ctrlData[addr].low && oldVal > ctrlData[addr].low) {
      msgCode = ALMCODE.LOWER_LIMIT_ALARM;
      almConf = ctrlData[addr].low;
    } else if((oldVal <= ctrlData[addr].low || oldVal >= ctrlData[addr].up) &&
          (newVal  > ctrlData[addr].low && newVal  < ctrlData[addr].up)) {
      msgCode = ALMCODE.BACK_NORMAL_ALARM;
      priority = 0;
    }
  } else if(hasUp) {
    if(utils.isNone(mbData[addr]) && newVal >= ctrlData[addr].up) {
      msgCode = ALMCODE.UPPER_LIMIT_ALARM;
      almConf = ctrlData[addr].up;
    } else if(newVal >= ctrlData[addr].up && oldVal < ctrlData[addr].up) {
      msgCode = ALMCODE.UPPER_LIMIT_ALARM;
      almConf = ctrlData[addr].up;
    } else if(oldVal >= ctrlData[addr].up && newVal < ctrlData[addr].up) {
      msgCode = ALMCODE.BACK_NORMAL_ALARM;
      priority = 0;
    }
  } else if(hasLow) {
    if(utils.isNone(mbData[addr]) && newVal <= ctrlData[addr].low) {
      msgCode = ALMCODE.LOWER_LIMIT_ALARM;
      almConf = ctrlData[addr].low;
    } else if(newVal <= ctrlData[addr].low && oldVal > ctrlData[addr].low) {
      msgCode = ALMCODE.LOWER_LIMIT_ALARM;
      almConf = ctrlData[addr].low;
    } else if(oldVal <= ctrlData[addr].low && newVal > ctrlData[addr].low) {
      msgCode = ALMCODE.BACK_NORMAL_ALARM;
      priority = 0;
    }
  }
  if(msgCode > 0) {
    regular.logAlarmData(dbsIdx, sn, addr, newVal);

    let almObj = {
      dbsIdx: dbsIdx,
      companyId: companyId,
      sn: sn,
      addr: addr,
      type: (ctrlData[addr].sam === '1') ? 2 : 0, // push + email or push
      priority: priority,
      msgCode: msgCode,
      extra: {
        sn: req.body.sn,
        desc: ctrlData[addr].desc,
        value: newVal,
        unit: (ctrlData[addr].unit ? ctrlData[addr].unit : ''),
      },
    };
    
    // Send Register config
    if(utils.has(almConf)) {
      almObj.extra.conf = almConf;
    }

    // Send Register Values
    for(let rr of ['rr1','rr2','rr3','rr4']) {
      if(!ctrlData[addr][rr] || ctrlData[addr][rr] === 'null') {
        continue;
      }
      let _addr = ctrlData[addr][rr].split("-")[0];
      if(!ctrlData[_addr] || !ctrlData[_addr].desc) { // the register might be removed
        continue;
      }
      let devVal = await(register.toDecVal(dbsIdx, sn, _addr));
      almObj.extra[rr] = ctrlData[addr][rr];
      almObj.extra[rr + '_desc']  = ctrlData[_addr].desc;
      almObj.extra[rr + '_value'] = utils.has(devVal) ? devVal : '';
      almObj.extra[rr + '_unit']  = ctrlData[_addr].unit ? ctrlData[_addr].unit : '';
    }

    alarm.send(almObj);
  }
};

const ioreg = (req, res) => {
  try {
    let reqIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    let agent = req.headers['user-agent'] ? req.headers['user-agent'] : '';
    let cntType = req.headers['content-type'];
    if(!(cntType.match(/application\/x-www-form-urlencoded/i))) {
      console.log('Unknown post (SrcIP: '+ reqIp +', Agent: ' + agent + ', Type: ' + cntType + ')');
      return res.end();
    }

    // check if the server is upgrading
    let now = new Date();
    let fwupg = await(csid.get('S', 'SERV_UPGRADING', 'int'));
    if(fwupg > 1420070400 && fwupg > parseInt(now.getTime() / 1000)) {
      return res.send('sn=' + req.body.sn + '&MAINT=' + fwupg + '\r\n');
    }
    // console.dir(req.body);
    db.escapes(req.body);

    let resStr = 'sn=' + req.body.sn;
    let sn = mac2hex(req.body.sn);
    let dbsIdx = await(device.getDBSIdx(sn));
    if(dbsIdx < 0) {
      info('The device hasn\'t been registered to any database! SN: ' + req.body.sn + ', Agent: ' + req.headers['user-agent']);
      return res.send('sn=' + req.body.sn + '&PT=0960\r\n');
    }

    // Reset Offline timer
    let devConf = await(device.get(dbsIdx, sn));
    if(!devConf) {
      info('Cant find device cache! SN: ' + req.body.sn + ', Agent: ' + req.headers['user-agent']);
      return res.send('sn=' + req.body.sn + '&PT=0960\r\n');
    }

    // Replace devConf if sn2 exists
    if(devConf.sn2) {
      let _devConf = await(device.get(dbsIdx, devConf.sn2));
      if(_devConf) {
        sn = mac2hex(devConf.sn2);
        devConf = _devConf;
      }
    }

    let szBody = req.headers['content-length'] ? parseInt(req.headers['content-length']) : 0;
    let sndIntval = now.getTime() - devConf.lastUpdate;
    if(prj.EN_RATE_CONTROL && sndIntval < prj.IOREG_RATE && szBody < 70) { 
      //info('1. ioreg too fast ... SN: ' + req.body.sn + ', Intval: ' + sndIntval);
      return res.end();
    }

    // check whether f/w upgrading or not
    if(devConf.fwUpg === 1) {
      if(req.body.BOOT) {
        devConf.uponce = true;
        devConf.fwUpg = 0;
      } else {
        info('F/W is upgrading... SN: ' + req.body.sn);
        await(storeEvtLog(devConf, req.body.EV));
        return res.send('sn=' + req.body.sn + '\r\n');
      }
    }

    // Online Alarm
    device.startStatTimer(devConf);

    // IP changed!
    if(devConf.ip !== reqIp) {
      // dbg('IP changed!');
      devConf.ip = reqIp;
      devConf.uponce = true;
    }

    // Set debug register if have any
    await(setDebugRegs());

    // check the packet sequenct
    // let mo = req.body.mo;
    let seq = parseInt(req.body.seq);
    let rightSeq = (devConf.seq && seq <= devConf.seq) ? false : true;
    if(rightSeq) {
      if(req.body.BOOT === '2') { // Reoot Alarm
        let duration = (devConf.lastUpdate > 1440000000000) ? utils.toTimeString(now.getTime() - devConf.lastUpdate) : '';
        alarm.send({
          dbsIdx: dbsIdx,
          companyId: devConf.companyId,
          sn: sn,
          type: 0, // push only
          msgCode: ALMCODE.DEV_REBOOT,
          extra: { duration },
        });
      } else if(!devConf.status || devConf.status === 0) { // Online Alarm
        let duration = (devConf.lastUpdate > 1440000000000) ? utils.toTimeString(now.getTime() - devConf.lastUpdate) : '';
        alarm.send({
          dbsIdx: dbsIdx,
          companyId: devConf.companyId,
          sn: sn,
          type: 0, // only push message
          msgCode: ALMCODE.ONLINE,
          message: (duration) ? ('Device ' + devConf.name + ' is online, duration: ' + duration) : ('Device ' + devConf.name + ' is online'),
        });
      }
      devConf.seq = seq;
      devConf.lastUpdate = now.getTime();
      devConf.status = 1;
    }

    // check register values in the packet
    let mbUpdated = false;
    let mbDataNew = {};
    let [mbData, ctrlData] = await([
      mbval.getAll(dbsIdx, sn), 
      ctrlblk.get(dbsIdx, sn)
    ]);

    let ioswList = []; // [addr1, addr2...]
    if(ctrlData) {
      // Virtual Register & Find IOSW List
      let haddrs = Object.keys(ctrlData);
      for(let i = 0; i < haddrs.length; i++) {
        let haddr = haddrs[i];
        let type = parseInt(ctrlData[haddr].type);
        if(utils.has(ctrlData[haddr].virt)) {
          if(!iotype.isMbusNumber(type)) {
            continue;
          } 
          if(iotype.is32bit(type)) {
            req.body[haddr] = 0;
            req.body[ctrlData[haddr].laddr] = 0;
          } else if(iotype.is64bit(type)) {
            req.body[haddr] = 0;
            req.body[ctrlData[haddr].iaddr] = 0;
            req.body[ctrlData[haddr].jaddr] = 0;
            req.body[ctrlData[haddr].laddr] = 0;
          } else { // 16bit
            req.body[haddr] = 0;
          }
        } else if(iotype.isIOSW(type) && ctrlData[haddr].swSN && ctrlData[haddr].swAddr) {
          ioswList.push(haddr);
        }
      }

      // Parsing req.body 
      let regAddrs = []; // right register addrs
      let addrs = Object.keys(req.body);
      for(let i = 0; i < addrs.length; i++) {
        let addr = addrs[i];

        // Dump value
        if(dumpRegs && dumpRegs.length > 0) {
          let idx = dumpRegs.indexOf(sn + ':' + addr);
          if(idx >= 0) {
            console.log(dumpRegs[idx] + '=' + req.body[addr]);
          }
        }

        // Undefined registers
        if(!ctrlData[addr] || req.body[addr] === '') {
          continue;
        } 

        // Apply Math equation
        if(iotype.isMathEq(ctrlData[addr].type) && ctrlData[addr].eq && ctrlData[addr].eq !== '') {
          calcMathEq(req, addr, devConf, ctrlData, mbData);
        }

        // Alarm (OLD) : Register Type, Up-Bound, Low-Bound
        sendRegAlarm(req, sn, addr, devConf, ctrlData, mbData);

        // if packet is out of order -> ignore it
        if(rightSeq) {
          regAddrs.push(addr);
        }
      }
      // Deceide which one need to be saved
      for(let i = 0; i < regAddrs.length; i++) {
        let addr = regAddrs[i];
        let val = req.body[addr];
        if(iotype.isModbusWRable(ctrlData[addr].type)) {
          if(mbData[addr] !== val) {
            if(!mbData[addr] || mbData[addr] === '0') {
              logEventData(devConf, ctrlData, addr, val);
            }
            mbData[addr] = val;
            mbDataNew[addr] = val;
            mbUpdated = true;
          }
        }
      }
    }

    //
    // Alarm from Device
    // UP/LOW/BackNormal Bound Alarm -> A0: back to normal, A1: Up, A2: Down
    // Slave device online/offline   -> B0: offline, B1: online
    //
    for(let almType of ['A', 'B']) {
      for(let i of [0, 1, 2]) {
        let type = almType + i;
        if(!req.body[type]) {
          continue;
        }
        let addrs = (Array.isArray(req.body[type])) ? req.body[type] : [req.body[type]];
        for(let j = 0; j < addrs.length; j++) {
          let addr = addrs[j];
          if(almType === 'A') {
            sendAxAlarm(type, req, sn, addr, devConf, ctrlData, mbData);
          } else if(almType === 'B') {
            let slvName = (devConf.slvDev && devConf.slvDev[addr]) ? devConf.slvDev[addr] : null;
            sendBxAlarm(type, sn, slvName, devConf);
          }
        }
      }
    }

    // ignore out of order seq.
    if(!rightSeq) {
      dbg('Out of order! cur: ' + devConf.seq + ' this: ' + seq + ' sn: ' + req.body.sn);
      await(storeEvtLog(devConf, req.body.EV));
      return res.send(resStr + ((devConf.seq) ? '&seq=' + devConf.seq : '&seq=' + parseInt(Date.now() / 1000)) + '\r\n');
    }

    // ignore too fast ioreg
    if(prj.EN_RATE_CONTROL && sndIntval < prj.IOREG_RATE) {
      dbg('2. ioreg too fast! Intval: ' + sndIntval + ', SN: ' + req.body.sn);
      await(storeEvtLog(devConf, req.body.EV));
      return res.send(resStr + '&PT=' + padZero(parseInt(devConf.pollTime).toString(16), 4).toUpperCase() + '\r\n');
    }

    // Slave Status
    if(typeof req.body.SLV !== 'undefined') {
      let slvStat = {};
      let slv = req.body.SLV.split(',');
      for(let i = 0; i < slv.length; i = i + 2) {
        if(slv[i]) {
          slvStat[slv[i]] = parseInt(slv[i+1]);
        }
      }
      devConf.slvStat = slvStat;
    }   

    // Prepare reply command.
    devConf._rcmd = [];
    while(devConf.rcmd.length > 0) {
      let rcmd = devConf.rcmd.shift();
      resStr += '&' + rcmd;
      devConf._rcmd.push(rcmd);
    }

    // IOSW copy value to destination
    for(let i = 0; i < ioswList.length; i++) {
      let haddr = ioswList[i];
      let swSN = mac2hex(ctrlData[haddr].swSN);
      let swAddr = ctrlData[haddr].swAddr;
      let swCtrlblk = await(ctrlblk.get(dbsIdx, swSN));
      if(!swCtrlblk || !swCtrlblk[swAddr] || (ctrlData[haddr].swId && ctrlData[haddr].swId !== swCtrlblk[swAddr].id)) { // clear data if device had been removed
        if(mbData[haddr]) {
          mbUpdated = true;
          mbData[haddr] = '';
          mbDataNew[haddr] = '';
          resStr += '&' + haddr + '=-';
        }
        // clear low byte
        for(let laddr of ['iaddr','jaddr','laddr']) {
          if(ctrlData[haddr][laddr] && mbData[ctrlData[haddr][laddr]]) {
            mbData[ctrlData[haddr][laddr]] = '';
            mbDataNew[ctrlData[haddr][laddr]] = '';
            resStr += '&' + ctrlData[haddr].laddr + '=-';
          }                    
        }
        continue;
      }
      // 16 bits: high byte copy
      let swHval = await(mbval.get(dbsIdx, swSN, swAddr));
      swHval = (typeof swHval  === 'undefined') ? '' : swHval;
      if(mbData[haddr] !== swHval) { // src val changed
        dbg('sw dev/haddr/hval: ' + swSN + '/' + swAddr + '/' + swHval + ' ---> sn/haddr/hval: ' + req.body.sn + '/' + haddr + '/' + mbData[haddr]);
        resStr += '&' + haddr + '=' + ((!swHval) ? '-' : swHval); // update device value
        mbData[haddr] = swHval;
        mbDataNew[haddr] = swHval;
        mbUpdated = true;
      }

      // 32/48/64 bits: low byte copy
      for(let laddr of ['iaddr','jaddr','laddr']) {                 
        if(!ctrlData[haddr][laddr]) { 
          continue;
        } else if(!swCtrlblk[swAddr][laddr]) {
          continue;
        }
        let srAddr = ctrlData[haddr][laddr];
        let swLval = await(mbval.get(dbsIdx, swSN, swCtrlblk[swAddr][laddr]));
        swLval = (typeof swLval  === 'undefined') ? '' : swLval;                
        if(mbData[srAddr] !== swLval) {
          dbg('sw dev/' + laddr + '/lval: ' + swSN + '/' + swCtrlblk[swAddr][laddr] + '' + swLval + ' ---> sn/' + laddr + '/lval: ' + req.body.sn + '/' + srAddr + '/' + mbData[srAddr]);
          resStr += '&' + srAddr + '=' + ((!swLval) ? '-' : swLval); // update device value
          swLval = swLval ? swLval : '';
          mbData[srAddr] = swLval;
          mbDataNew[srAddr] = swLval;
          mbUpdated = true;
        }
      }
    }

    // check polling time
    let pollTime = (req.body.PT) ? req.body.PT : '' ;
    let _pollTime = parseInt('0x' + pollTime);
    if(await(iosw.inFastPT(dbsIdx, sn))) {
      if(_pollTime !== prj.DEV_FAST_PT) {
        info('IOSW polling time (sn: ' + sn + ', 0x' + pollTime + ' -> ' + prj.DEV_FAST_PT + ')');
        resStr += '&PT=' + padZero(prj.DEV_FAST_PT.toString(16), 4).toUpperCase();
      }
    } else {
      let fastPt = await(mcache.get(dbsIdx, sn, 'DEV_FAST_PT', 'int'));
      if(fastPt) {
        if(_pollTime !== fastPt) {
          info('Fast polling time (sn: ' + sn + ', 0x' + pollTime + ' -> ' + fastPt + ')');
          resStr += '&PT=' + padZero(fastPt.toString(16), 4).toUpperCase();
        }
      } else if(pollTime && devConf.pollTime !== _pollTime) {
        info('polling time changed (sn: ' + sn + ', 0x' + pollTime + ' -> ' + devConf.pollTime + ')');
        resStr += '&PT=' + padZero(parseInt(devConf.pollTime).toString(16), 4).toUpperCase();
      }
    }

    // Boot
    if(req.body.BOOT && parseInt(req.body.BOOT) > 0) {
      if(ctrlData) {
        Object.keys(ctrlData).forEach((addr) => {
          let type = parseInt(ctrlData[addr].type);
          if((iotype.isAppWRable(type) || iotype.isIOSW(type)) && mbData[addr] && mbData[addr] !== '') { // set device default value
            resStr += '&' + addr + '=' + mbData[addr];
          }
        });
      }
      resStr += '&BOOT=0' + ((devConf.seq) ? '&seq=' + devConf.seq : '&seq=' + parseInt(Date.now()/1000));
    }

    // Get current f/w version
    if(agent.match(/keystone microtech/i)) {
      let fwVer = parseInt(agent.split('v100b')[1]);
      if(fwVer && devConf.fwVer !== fwVer) {
        dbg('Save F/W version ' + devConf.mo +  ' - ' + fwVer);
        devConf.fwVer = fwVer;
        devConf.uponce = true;
      }
    }

    // update mbdata to database
    if(mbUpdated) {
      await(device.ceUpdate(sn, devConf, mbDataNew));
    } else {
      await(device.ceUpdate(sn, devConf));
    }

    // handle event log
    await(storeEvtLog(devConf, req.body.EV));

    // info( ' -> ' + resStr);
    return res.send(resStr + '\r\n');
  } catch(e) {
    info('Device: ' + req.body.sn + '\n' + e.stack);
    return res.end();
  }
};

router.post('/', ioreg);

module.exports = router;
