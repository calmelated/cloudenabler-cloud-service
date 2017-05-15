const express = require('express');
const prj = require('../project');
const gstate = require(prj.GSTATE_PATH);
const db = require(prj.LIB_PATH + '/db');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const utils = require(prj.LIB_PATH + '/utils');

const MCODE = {
  UNKNOWN:            1,
  LOCAL:              2,
  REMOTE:             3,
  ON:                 4,
  OFF:                5,
  TRIP:               6,
  NORMAL:             7,
  ERROR:              8,
  DISCNT:             9,
  PUTON:              10,
  ONSITE:             11,
  R:                  12,
  L:                  13,
  C:                  14,
  REMOTE2:            15,
  FAULT:              16,
  OPERATE:            17,
  STOP:               18,
  RUNNING:            19,
  TEST_POSITION:      20,
  CONNECT_POSITION:   21,
  MANUAL:             22,
  AUTOMATIC:          23,
  ABNORMAL:           24,
  SLIGHT_DISCHARGE:   25,
  SERIOUS_DISCHARGE:  26,
  CUTOFF:             27, 
  OFF2:               28, 
  ON_RED:             29,
  ON_GREEN:           30,
  OFF_RED:            31,
  OFF_GREEN:          32,
};

module.exports.save = (ioInfo) => {
  let mcode = MCODE.UNKNOWN;
  if(ioInfo.dt === '10') { // YATEC: 0 -> Local, 1 -> Remote
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.LOCAL;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.REMOTE;
    }
  } else if(ioInfo.dt === '11') { // YATEC: 0 -> OFF, 1 -> ON, 2 -> Trip
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.OFF;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.ON;
    } else if(parseInt(ioInfo.rVal) === 2) {
      mcode = MCODE.TRIP;
    }
  } else if(ioInfo.dt === '12') { // HYEC: 0 -> Normal, 1 -> ERROR
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.NORMAL;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.ERROR;
    }
  } else if(ioInfo.dt === '13') { // HYEC: 82/76/67 -> R/L/C
    if(parseInt(ioInfo.rVal) === 82) {
      mcode = MCODE.R;
    } else if(parseInt(ioInfo.rVal) === 76) {
      mcode = MCODE.L;
    } else if(parseInt(ioInfo.rVal) === 67) {
      mcode = MCODE.C;
    }
  } else if(ioInfo.dt === '14') { // HYEC: 0 -> Disconnect, 1 -> Put in
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.DISCNT;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.PUTON;
    }
  } else if(ioInfo.dt === '15') { // HYEC: 0 -> Put in, 1 -> Disconnect
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.PUTON;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.DISCNT;
    }
  } else if(ioInfo.dt === '16') { // HYEC: 0 -> On site, 1 -> Remote
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.ONSITE;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.REMOTE2;
    }
  } else if(ioInfo.dt === '17') { // HYEC: 0 -> Remote, 1 -> On site
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.REMOTE2;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.ONSITE;
    }
  } else if(ioInfo.dt === '18') { // HYEC: Fault/Normal ->  0/1
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.FAULT;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.NORMAL;
    }
  } else if(ioInfo.dt === '19') { // HYEC: Normal/Slight Partial/Serious Partial discharge 0/1/2
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.NORMAL;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.SLIGHT_DISCHARGE;
    } else if(parseInt(ioInfo.rVal) === 2) {
      mcode = MCODE.SERIOUS_DISCHARGE;
    }        
  } else if(ioInfo.dt === '20') { // HYEC: ON/OFF 0/1
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.OPERATE;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.STOP;
    } 
  } else if(ioInfo.dt === '21') { // HYEC: OFF/ON 0/1
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.STOP;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.OPERATE;
    }         
  } else if(ioInfo.dt === '22') { // HYEC: Running/Stop 0/1
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.RUNNING;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.OFF2;
    } 
  } else if(ioInfo.dt === '23') { // HYEC: Stop/Running 0/1
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.OFF2;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.RUNNING;
    }         
  } else if(ioInfo.dt === '24') { // HYEC: Open/Close 0/1
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.CUTOFF;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.PUTON;
    } 
  } else if(ioInfo.dt === '25') { // HYEC: Close/Open 0/1
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.PUTON;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.CUTOFF;
    } 
  } else if(ioInfo.dt === '26') { // HYEC: Normal/Trip 0/1
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.NORMAL;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.TRIP;
    }                 
  } else if(ioInfo.dt === '27') { // HYEC: Trip/Normal  0/1
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.TRIP;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.NORMAL;
    }  
  } else if(ioInfo.dt === '28') { // HYEC: Test/Connect Position  0/1
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.TEST_POSITION;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.CONNECT_POSITION;
    }  
  } else if(ioInfo.dt === '29') { // HYEC: Connect/Test Position 0/1
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.CONNECT_POSITION;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.TEST_POSITION;
    }  
  } else if(ioInfo.dt === '30') { // HYEC: Manual/Automatic 0/1
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.MANUAL;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.AUTOMATIC;
    }  
  } else if(ioInfo.dt === '31') { // HYEC: Automatic/Manual 0/1
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.AUTOMATIC;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.MANUAL;
    }  
  } else if(ioInfo.dt === '32') { // HYEC: Normal/Abnormal 0/1
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.NORMAL;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.ABNORMAL;
    }  
  } else if(ioInfo.dt === '33') { // HYEC: Abnormal/Normal 0/1
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.ABNORMAL;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.NORMAL;
    }                                                         
  } else if(ioInfo.dt === '34') { // YATEC: OFF(GREEN)/ON(RED) 0/1
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.OFF_GREEN;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.ON_RED;
    } 
  } else if(ioInfo.dt === '35') { // YATEC: OFF(RED)/ON(GREEN) 0/1
    if(parseInt(ioInfo.rVal) === 0) {
      mcode = MCODE.OFF_RED;
    } else if(parseInt(ioInfo.rVal) === 1) {
      mcode = MCODE.ON_GREEN;
    }         
  } else { // undefined
    return;
  }
  let nowSec = parseInt(Date.now() / 1000);
  let companyId = ioInfo.companyId;
  let addr = ioInfo.addr;
  let sn = ioInfo.sn;

  // End last different state  (caculate accumulated time)
  let qStr = 'SELECT `time`,`accTime` FROM `' + db.TB_IOSTAT_LOG + '` WHERE `companyId` = ' + companyId + ' AND `sn` = UNHEX(\'' + sn + '\') AND `addr` = \'' + addr + '\' AND `msgCode` != ' + mcode + ' ORDER BY `time` DESC LIMIT 1;';
  let result = await(db.pr_query(ioInfo.dbsIdx, qStr));
  if(!result.err && result.data.length > 0 && (utils.has(result.data[0].time))) {
    let lastTime = result.data[0].time;
    let accTime = result.data[0].accTime;
    qStr = 'UPDATE `' + db.TB_IOSTAT_LOG + '` SET accTime = \'' + (accTime + (nowSec - lastTime)) + '\' WHERE `time` = ' + lastTime + ' AND `companyId` = ' + companyId + ' AND `sn` = UNHEX(\'' + sn + '\') AND `addr` = \'' + addr + '\';'; 
    result = await(db.pr_wquery(ioInfo.dbsIdx, qStr));
    if(result.err) { 
      dbg({__file, __line, err: result.err}); 
    }        
  } 

  // Find last state (same msgCode)
  let accNum = 0;
  let accTime = 0;
  qStr = 'SELECT `time`,`accNum`,`accTime` FROM `' + db.TB_IOSTAT_LOG + '` WHERE `companyId` = ' + companyId + ' AND `sn` = UNHEX(\'' + sn + '\') AND `addr` = \'' + addr + '\' AND `msgCode` = ' + mcode + ' ORDER BY `time` DESC LIMIT 1;';
  result = await(db.pr_query(ioInfo.dbsIdx, qStr));
  if(result.err || result.data.length === 0 || (utils.isNone(result.data[0].time))) {
    dbg({__file, __line, err: result.err}); 
  } else {
    accNum = result.data[0].accNum;
    accTime = result.data[0].accTime;
  }
  qStr = 'INSERT INTO `' + db.TB_IOSTAT_LOG + '` (`time`,`companyId`,`sn`,`addr`,`account`,`regName`,`msgCode`,`accNum`,`accTime`) VALUES (' + 
       '\'' + nowSec    + '\','  + 
       '\'' + companyId + '\','  +  
       'UNHEX(\'' + sn  + '\'),' +  
       '\'' + addr + '\','    +  
       '\'' + ioInfo.devName  + '\',' + 
       '\'' + ioInfo.rName    + '\',' + 
       '\'' + mcode           + '\',' + 
       '\'' + (accNum + 1)    + '\',' + 
       '\'' + accTime + '\');';

  result = await(db.pr_wquery(ioInfo.dbsIdx, qStr));
  if(result.err) { 
    info({__file, __line, err: result.err}); 
  }
  return result;
};
