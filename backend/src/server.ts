import 'dotenv/config';
import { createApp } from './app';

const configuredPort = Number(process.env.PORT);
const port = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 3001;

createApp().listen(port, () => {
  console.log(`Benefits backend listening at http://localhost:${port}`);
});
