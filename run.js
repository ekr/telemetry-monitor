var Telemetry = require('telemetry-next-node');

Telemetry.init(function() {
    var versions = Telemetry.getVersions();
    console.log(versions);
});
