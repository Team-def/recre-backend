import { WebSocketGateway } from '@nestjs/websockets';
import { SessionGateway } from '../session.gateway';

@WebSocketGateway({
    namespace: 'catch',
    transports: ['websocket'],
    pingInterval: 3000,
    pingTimeout: 10000,
    cookie: false,
    serveClient: false,
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 1000,
})
export class CatchGateway extends SessionGateway {
    constructor() {
        super();
    }
}