import { httpServer } from './http_server/index';
import './ws_server/index';

const HTTP_PORT = 8181;

console.log(
  `Start static http server on the http://localhost:${HTTP_PORT} port!`,
);
httpServer.listen(HTTP_PORT);
