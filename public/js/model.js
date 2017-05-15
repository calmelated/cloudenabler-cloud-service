
// Model Define
const SIO             = '6101';
const SIO_PLUS_1      = '61205W';
const SIO_PLUS_2      = '61220';
const CE_63511        = '63511';
const CE_63511W       = '63511W';
const CE_63512        = '63512';
const CE_63512W       = '63512W';
const CE_63513        = '63513';
const CE_63513W       = '63513W';
const CE_63514        = '63514';
const CE_63514W       = '63514W';
const CE_63515        = '63515';
const CE_63515W       = '63515W';
const CE_63516        = '63516';
const CE_63516W       = '63516W';
const CE_HY_63511     = 'HY-63511';
const CE_HY_63511W    = 'HY-63511W';
const CE_HY_63512     = 'HY-63512';
const CE_HY_63512W    = 'HY-63512W';
const CE_HY_63515     = 'HY-63515';
const CE_HY_63515W    = 'HY-63515W';
const CE_HY_63516     = 'HY-63516';
const CE_HY_63516W    = 'HY-63516W';
const CE_YT_63511     = 'YT-63511';
const CE_YT_63511W    = 'YT-63511W';
const CE_YT_63512     = 'YT-63512';
const CE_YT_63512W    = 'YT-63512W';
const CE_YT_63515     = 'YT-63515';
const CE_YT_63515W    = 'YT-63515W';
const CE_YT_63516     = 'YT-63516';
const CE_YT_63516W    = 'YT-63516W';

const MODEL_NAME = [];
MODEL_NAME[CE_63511]     = 'KT-63511  - Cloud Enabler 128 Registers';
MODEL_NAME[CE_63511W]    = 'KT-63511W - Cloud Enabler 128 Registers, WiFi';
MODEL_NAME[CE_63512]     = 'KT-63512  - Cloud Enabler 256 Registers';
MODEL_NAME[CE_63512W]    = 'KT-63512W - Cloud Enabler 256 Registers, WiFi';
MODEL_NAME[CE_63513]     = 'KT-63512  - Cloud Enabler 128 Registers';
MODEL_NAME[CE_63513W]    = 'KT-63512W - Cloud Enabler 128 Registers, WiFi';
MODEL_NAME[CE_63514]     = 'KT-63514  - Cloud Enabler 256 Registers';
MODEL_NAME[CE_63514W]    = 'KT-63514W - Cloud Enabler 256 Registers, WiFi';
MODEL_NAME[CE_63515]     = 'KT-63515  - MasterMode CE 128 Registers';
MODEL_NAME[CE_63515W]    = 'KT-63515W - MasterMode CE 128 Registers, WiFi';
MODEL_NAME[CE_63516]     = 'KT-63516  - MasterMode CE 256 Registers';
MODEL_NAME[CE_63516W]    = 'KT-63516W - MasterMode CE 256 Registers, WiFi';
MODEL_NAME[CE_HY_63511]  = 'HY-63511  - Cloud Enabler 128 Registers';
MODEL_NAME[CE_HY_63511W] = 'HY-63511W - Cloud Enabler 128 Registers, WiFi';
MODEL_NAME[CE_HY_63512]  = 'HY-63512  - Cloud Enabler 256 Registers';
MODEL_NAME[CE_HY_63512W] = 'HY-63512W - Cloud Enabler 256 Registers, WiFi';
MODEL_NAME[CE_HY_63515]  = 'HY-63515  - MasterMode CE 128 Registers';
MODEL_NAME[CE_HY_63515W] = 'HY-63515W - MasterMode CE 128 Registers, WiFi';
MODEL_NAME[CE_HY_63516]  = 'HY-63516  - MasterMode CE 256 Registers';
MODEL_NAME[CE_HY_63516W] = 'HY-63516W - MasterMode CE 256 Registers, WiFi';
MODEL_NAME[CE_YT_63511]  = 'YT-63511  - Cloud Enabler 128 Registers';
MODEL_NAME[CE_YT_63511W] = 'YT-63511W - Cloud Enabler 128 Registers, WiFi';
MODEL_NAME[CE_YT_63512]  = 'YT-63512  - Cloud Enabler 256 Registers';
MODEL_NAME[CE_YT_63512W] = 'YT-63512W - Cloud Enabler 256 Registers, WiFi';
MODEL_NAME[CE_YT_63515]  = 'YT-63515  - MasterMode CE 128 Registers';
MODEL_NAME[CE_YT_63515W] = 'YT-63515W - MasterMode CE 128 Registers, WiFi';
MODEL_NAME[CE_YT_63516]  = 'YT-63516  - MasterMode CE 256 Registers';
MODEL_NAME[CE_YT_63516W] = 'YT-63516W - MasterMode CE 256 Registers, WiFi';

const isCloudEnabler = function(mo) {
    return (mo === 'CloudEnabler' || mo === 'CE'         ||
            mo === CE_63511       || mo === CE_63511W    ||
            mo === CE_63512       || mo === CE_63512W    ||
            mo === CE_63513       || mo === CE_63513W    ||
            mo === CE_63514       || mo === CE_63514W    ||
            mo === CE_63515       || mo === CE_63515W    ||
            mo === CE_63516       || mo === CE_63516W    ||
            mo === CE_HY_63511    || mo === CE_HY_63511W ||
            mo === CE_HY_63512    || mo === CE_HY_63512W ||
            mo === CE_HY_63515    || mo === CE_HY_63515W ||
            mo === CE_HY_63516    || mo === CE_HY_63516W ||
            mo === CE_YT_63511    || mo === CE_YT_63511W ||
            mo === CE_YT_63512    || mo === CE_YT_63512W ||
            mo === CE_YT_63515    || mo === CE_YT_63515W ||
            mo === CE_YT_63516    || mo === CE_YT_63516W
        ) ? true : false ;
};

const isMbusMaster = function(mo) {
    return (mo === CE_63515     || mo === CE_63515W    || 
            mo === CE_63516     || mo === CE_63516W    ||
            mo === CE_HY_63515  || mo === CE_HY_63515W || 
            mo === CE_HY_63516  || mo === CE_HY_63516W ||
            mo === CE_YT_63515  || mo === CE_YT_63515W || 
            mo === CE_YT_63516  || mo === CE_YT_63516W
    ) ? true : false ;
};

const isSIOPlus = function(mo) {
    return (mo === SIO_PLUS_1 || mo === SIO_PLUS_2) ? true : false ;
};

const isSIO = function(mo) {
    return (mo === SIO) ? true : false ;
};

const getMaxReg = function(mo) {
    if(mo === CE_63512    || mo === CE_63512W    || 
       mo === CE_63514    || mo === CE_63514W    || 
       mo === CE_63516    || mo === CE_63516W    ||
       mo === CE_HY_63512 || mo === CE_HY_63512W || 
       mo === CE_HY_63516 || mo === CE_HY_63516W ||
       mo === CE_YT_63512 || mo === CE_YT_63512W || 
       mo === CE_YT_63516 || mo === CE_YT_63516W ) {
        return 256;
    } else {
        return 128;
    }
};

// Export function for node.js. Because we shared these functions both in frontend and backend
try {
    module.exports.SIO              = SIO;
    module.exports.SIO_PLUS_1       = SIO_PLUS_1;
    module.exports.SIO_PLUS_2       = SIO_PLUS_2;
    module.exports.CE_63511         = CE_63511;
    module.exports.CE_63511W        = CE_63511W;
    module.exports.CE_63512         = CE_63512;
    module.exports.CE_63512W        = CE_63512W;
    module.exports.CE_63513         = CE_63513;
    module.exports.CE_63513W        = CE_63513W;
    module.exports.CE_63514         = CE_63514;
    module.exports.CE_63514W        = CE_63514W;
    module.exports.CE_63515         = CE_63515;
    module.exports.CE_63515         = CE_63515W;
    module.exports.CE_63516         = CE_63516;
    module.exports.CE_63516W        = CE_63516W;
    module.exports.CE_HY_63511      = CE_HY_63511;
    module.exports.CE_HY_63511W     = CE_HY_63511W;
    module.exports.CE_HY_63512      = CE_HY_63512;
    module.exports.CE_HY_63512W     = CE_HY_63512W;
    module.exports.CE_HY_63515      = CE_HY_63515;
    module.exports.CE_HY_63515      = CE_HY_63515W;
    module.exports.CE_HY_63516      = CE_HY_63516;
    module.exports.CE_HY_63516W     = CE_HY_63516W;
    module.exports.CE_YT_63511      = CE_YT_63511;
    module.exports.CE_YT_63511W     = CE_YT_63511W;
    module.exports.CE_YT_63512      = CE_YT_63512;
    module.exports.CE_YT_63512W     = CE_YT_63512W;
    module.exports.CE_YT_63515      = CE_YT_63515;
    module.exports.CE_YT_63515      = CE_YT_63515W;
    module.exports.CE_YT_63516      = CE_YT_63516;
    module.exports.CE_YT_63516W     = CE_YT_63516W;
    module.exports.isSIO            = isSIO;
    module.exports.isSIOPlus        = isSIOPlus;
    module.exports.isCloudEnabler   = isCloudEnabler;
    module.exports.isMbusMaster     = isMbusMaster;
    module.exports.getMaxReg        = getMaxReg;
} catch(e) {
}
