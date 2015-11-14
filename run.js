var Telemetry = require('telemetry-next-node');
var gauss = require('gauss');
var fs = require('fs');
var irc = require('irc');
var ircchannel = '#telemetry-monitoring';
var nick = 'telemetry-monitor' + Math.floor(Math.random() * 10000);
var gReported = {};

var client = new irc.Client('irc.mozilla.org', nick, {
    channels: [ircchannel],
});

client.addListener('message', function (from, to, message) {
    console.log(from + ' => ' + to + ': ' + message);
});


var gMaxVersion;
var kChannelOffsets = {
    nightly:0,
    aurora:-1,
    beta:-2,
    release:-3
};

var kDefaultConfig = {
    lookback : 60,
    threshold : 2,
    interval: 86400,
    loglevel: 0
};

function assert(condition, message) {
    if (!condition) {
      throw message === undefined ? "Assertion failed" : message;
    }
    return condition;
}

function log(level, msg) {
   if (configParam(config, null, 'loglevel')>=level) {
        console.log(msg);
   }
}

function debug(msg) {
    log(2, msg);
}

function report(date, metric, channel, bucket, msg) {
    var id = [metric, channel, bucket, date].join(":");
    var emit = "ANOMALY: " + id + " " + msg;
    
    log(1, emit);

    if (gReported[id])
        return;

    gReported[id] = msg;
    client.say(ircchannel, emit);
}

function configParam(config, cconfig, param) {
    if (cconfig && cconfig.params && (cconfig.params[param] !== undefined))
        return cconfig.params[param];
    if (config && config.params && (config.params[param] !== undefined))
        return config.params[param];

    return kDefaultConfig[param];
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
    buckets.forEach(function(bucket) {
        var baseline=[];

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
                if (Math.abs(value - mean) > (configParam(config, null, 'threshold') * sd)) {
                    report(date, metric, channel, bucket,
                          "mean=" + mean + " value=" + value);
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

    debug("Time series for " + channel + ":" + metric + " lookback = " + lookback);

    for (i=1; i<=version_ct; ++i) {
        v = gMaxVersion + kChannelOffsets[channel] + i - version_ct;
        debug("Looking at version " + v);
        Telemetry.getEvolution(channel, v.toString(), metric, {}, true, function(evolutionMap) {
            debug("Report for version " + v);
            if (evolutionMap[""]) {
                debug(evolutionMap[""]);
                if (!evolutions) {
                    evolutions = evolutionMap[""];
                } else {
                    evolutions = evolutions.combine(evolutionMap[""]);
                }
            } else {
                debug("Empty report");
            }
            version_ct--;
            if (!version_ct) {
                debug("Complete for " + channel + ":" + metric + " lookback = " + lookback);
                lookForBreaks(channel, metric, buckets, evolutions.dateRange(dates[0], dates[1]));
            }
        });
    }
};

function runChecks() {
    Telemetry.init(function() {
        var metric;
        var channel;
        var buckets;
        var cconfig;

        recordVersions(Telemetry.getVersions());
        for (metric in config.metrics) {
            cconfig = config.metrics[metric];
            cconfig.channels.forEach(function(channel) {
                debug("Measuring " + metric + " channel=" + channel + " buckets =" + cconfig.buckets );
                timeSeries(channel, metric, cconfig.buckets, configParam(config, cconfig, 'lookback'));
            });
        }
    });

    setTimeout(runChecks, configParam(config, null, 'interval')*1000);
}    

if (process.argv.length != 3)
    throw "Provide config file";

var configStr = fs.readFileSync(process.argv[2]);
var config = JSON.parse(configStr);

setTimeout(runChecks, 10000);



