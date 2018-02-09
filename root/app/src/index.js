import express from 'express';
import Prometheus from 'prom-client';
import { spawn } from 'child_process';
import carrier from 'carrier';
import loadConfig from './config';

const config = loadConfig('/config/corsairexporter.json', ['device']);

const port = config.port || 9123;
const scrapeInterval = (config.scrapeInterval || 15) * 1000;
const defaultMetrics = Prometheus.collectDefaultMetrics({ timeout: scrapeInterval });

const namePrefix = 'corsair';

const gauges = {
  fanMode: new Prometheus.Gauge({ name: `${namePrefix}_fanMode`, help: 'Fan mode' }),
  fanSetting: new Prometheus.Gauge({ name: `${namePrefix}_fanSetting`, help: 'Fan setting' }),
  fanSpeed: new Prometheus.Gauge({ name: `${namePrefix}_fanSpeed`, help: 'Fan speed' }),
  temperature: new Prometheus.Gauge({ name: `${namePrefix}_temperature`, help: 'Temperature' }),
  voltage: new Prometheus.Gauge({ name: `${namePrefix}_voltage`, help: 'Voltage' }),
  current: new Prometheus.Gauge({ name: `${namePrefix}_current`, help: 'Input current' }),
  inputPower: new Prometheus.Gauge({ name: `${namePrefix}_inputPower`, help: 'Input power' }),
  outputPower: new Prometheus.Gauge({ name: `${namePrefix}_outputPower`, help: 'Output power' }),
  efficiency: new Prometheus.Gauge({ name: `${namePrefix}_efficiency`, help: 'Efficiency' }),
};
const main = () => {
  // Spawn the child process
  const cmd = spawn('/app/cpsumoncli', [config.device]);

  // Use carrier to build a buffer delimited by line
  const line = carrier.carry(cmd.stdout);
  line.on('line', (data) => {
    // Check json received can be parsed
    console.log(data.toString());
    try {
      const jsonData = JSON.parse(data.toString());
      if (jsonData === undefined) return;

      // Set gauges
      for (let key in gauges) {
        if (jsonData.hasOwnProperty(key)) {
          gauges[key].set(jsonData[key]);
        }
      }
    } catch (err) {
      console.log(`Unable to parse incoming data (${data}`);
    }
  });

  cmd.stderr.on('data', (data) => {
    console.log(data.toString());
  });

  cmd.on('close', (code) => {
    console.log(`Child process exited with code ${code}`);
  });

  cmd.on('error', (error) => {
    console.log('Failed to start process', error);
  });
};

// Setup our HTTP webserver
const app = express();
app.get('/', (req, res, next) => {
  setTimeout(() => {
    res.send('Point Prometheus here for your Corsair statistics');
    next();
  }, Math.round(Math.random() * 200));
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', Prometheus.register.contentType);
  res.end(Prometheus.register.metrics());
});

app.use((err, req, res, next) => {
  res.statusCode = 500;

  // Dev only:
  //res.json({ error: err.message });
  next();
});

const server = app.listen((port), () => {
  console.log(`Running corsairexporter. Listening on port ${port}.`);
  main();
});

// Shutdown gracefully
process.on('SIGTERM', () => {
  clearInterval(defaultMetrics);
  server.close((err) => {
    if (err) {
      console.log(err);
      process.exit(1);
    }
    process.exit(0);
  });
});