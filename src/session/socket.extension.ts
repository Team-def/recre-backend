import { Socket } from 'socket.io';
import { User } from 'src/user/entities/user.entity';
import { ClientEntity } from './cliententity/client.entity';

export type SocketExtension = Socket & {
    uuId: string;
    qrKey: string;
    hostInfo: User;
    clientEntity: ClientEntity;
};
