import { Socket } from 'socket.io';
import { User } from 'src/user/entities/user.entity';
import { ClientEntity } from './cliententity/client.entity';

/**
 * Socket 타입 확장 in SessionGuard
 */
export type SocketExtension = Socket & {
    uuId: string;
    qrKey: string;
    hostInfo: User;
    clientEntity: ClientEntity;
};
