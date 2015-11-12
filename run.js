var Telemetry = require('telemetry-next-node');
var gauss = require('gauss');

var gMaxVersion;
var kChannelOffsets = {
    nightly:0,
    aurora:-1,
    beta:-2,
    release:-3
};


function assert(condition, message) {
    if (!condition) {
      throw message === undefined ? "Assertion failed" : message;
    }
    return condition;
}

function debug(msg) {
    console.log(msg);
}
function recordVersions(vlist) {
    debug(vlist);
    
    vlist.forEach(v => {
        var x;

        x = v.split("/");
        gMaxVersion = parseInt(x[1]);
    });
    debug("Maximum version = " + gMaxVersion);
}

function timeSeries(channel, metric, lookback, cb) {
    var version_ct = Math.floor((lookback / 42) + 2);  // Max number of versions to capture lookback days
    var i;
    var v;
    var dates = [new Date(Date.now() - (1000 * 60 * 60 * 24 * lookback)), new Date()];
    var evolutions = null;
    
    for (i=1; i<=version_ct; ++i) {
        v = gMaxVersion + kChannelOffsets[channel] + i - version_ct;
        debug(v);
        Telemetry.getEvolution(channel, v.toString(), metric, {}, true, function(evolutionMap) {
            if (evolutionMap[""]) {
                if (!evolutions) {
                    evolutions = evolutionMap[""];
                } else {
                    evolutions = evolutions.combine(evolutionMap[""]);
                }
            }
            version_ct--;
            if (!version_ct) {
                cb(evolutions.dateRange(dates[0], dates[1]));
            }
        });
    }
};

function lookForBreaks(series, bucket) {
    var data=[];
    series.map(function(hist, i, date) {
        var sd;
        var mean;
        var v;
        var value = hist.values[bucket]/hist.count;
        debug(date);
        if (data.length > 5) {
            v = gauss.Vector(data);
            mean = v.mean();
            sd = v.stdev();
            if (Math.abs(value - mean) > (2 * sd)) {
                debug("Anomaly at " + date + " mean = " + mean
                      + " value = " + value);
            }
        }
        data.push(value);
    });
}

Telemetry.init(function() {
    recordVersions(Telemetry.getVersions());
    timeSeries("beta", "CERT_CHAIN_SIGNATURE_DIGEST_STATUS", 60,
                    function(e) {
                        lookForBreaks(e, 5);
                    }
               );
    });


