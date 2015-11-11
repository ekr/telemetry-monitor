var Telemetry = require('telemetry-next-node');

var gAllVersions = null;

function assert(condition, message) {
    if (!condition) {
      throw message === undefined ? "Assertion failed" : message;
    }
    return condition;
}

function recordVersions(vlist) {
    gAllVersions = {
        nightly:[],
        aurora:[],
        beta:[],
        release:[]
    };

    vlist.forEach(v => {
        var x;

        console.log(v);
        x = v.split("/");
        gAllVersions[x[0]].push(x[1]);
    });

    console.log(gAllVersions);
}

function timeSeries(channel, metric, lookback, cb) {
    var version_ct = Math.floor((lookback / 42) + 2);  // Max number of versions to capture lookback days
    var versions = gAllVersions[channel].slice(-1 * version_ct);
    var dates = [new Date(Date.now() - (1000 * 60 * 60 * 24 * lookback)), new Date()];
    var evolutions = null;

    versions.forEach(function (v) {
        console.log("Version " +v);
        console.log(channel);

        Telemetry.getEvolution(channel, v.toString(), metric, {}, true, function(evolutionMap) {
            if (!evolutions) {
                console.log("XXX");
                evolutions = evolutionMap[""];
            } else {
                console.log("YYY");
                evolutions.combine(evolutionMap[""]);
            }

            if (evolutions) {
                console.log("Evolution is non-null");
            }
            
            version_ct--;
            if (!version_ct) {
                cb(evolutions.dateRange(dates[0], dates[1]));
            }
        });
    });
 };


 Telemetry.init(function() {
    recordVersions(Telemetry.getVersions());
    timeSeries("nightly", "CERT_CHAIN_SIGNATURE_DIGEST_STATUS", 30,
               function(e) {
                   e.map(function(hist, i, date) {
                       console.log(date);
                       console.log(hist);
                   });
               }
              );
});
