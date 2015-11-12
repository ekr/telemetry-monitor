var Telemetry = require('telemetry-next-node');
var gauss = require('gauss');
var fs = require('fs');

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
//    console.log(msg);
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


function lookForBreaks(channel, metric, buckets, series) {
    var baseline=[];

    buckets.forEach(function(bucket) {
        debug("Looking for breaks in bucket " + bucket);
        series.map(function(hist, i, date) {
            var sd;
            var mean;
            var v;
            var value = hist.values[bucket]/hist.count;
            debug(date);
            if (baseline.length > 5) {
                v = gauss.Vector(baseline);
                mean = v.mean();
                sd = v.stdev();
                if (Math.abs(value - mean) > (2 * sd)) {
                    console.log("ANOMALY: " + metric + ":" + channel + ":" + bucket + " " + date + " mean=" + mean
                                + " value=" + value);
                }
            }
            baseline.push(value);
        });
    });
}

function timeSeries(channel, metric, buckets, lookback) {
    var version_ct = Math.floor((lookback / 42) + 2);  // Max number of versions to capture lookback days
    var i;
    var v;
    var dates = [new Date(Date.now() - (1000 * 60 * 60 * 24 * lookback)), new Date()];
    var evolutions = null;

    debug("Time series for " + channel + ":" + metric);

    for (i=1; i<=version_ct; ++i) {
        v = gMaxVersion + kChannelOffsets[channel] + i - version_ct;
        debug("Looking at version " + v);
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
                lookForBreaks(channel, metric, buckets, evolutions.dateRange(dates[0], dates[1]));
            }
        });
    }
};

if (process.argv.length != 3)
    throw "Provide config file";

var configStr = fs.readFileSync(process.argv[2]);
var config = JSON.parse(configStr);

Telemetry.init(function() {
    var metric;
    var channel;
    var buckets;
    var cconfig;

    recordVersions(Telemetry.getVersions());
    for (metric in config) {
        cconfig = config[metric];
        cconfig.channels.forEach(function(channel) {
            debug("Measuring " + metric + " channel=" + channel + "buckets =" + cconfig.buckets );
            timeSeries(channel, metric, cconfig.buckets, 60);
        });
    }
});



