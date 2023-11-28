import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Host } from './entities/host.entity';
import { CatchGame } from './entities/catch.game.entity';
import { CatchPlayer } from './entities/catch.player.entitiy';
import { RedGreenPlayer } from './entities/redgreen.player.entity';
import { RedGreenGame } from './entities/redgreen.game.entity';

@Injectable()
export class SessionInfoService {
    constructor(
        // @InjectRepository(Player, 'sqlite')
        // private readonly playerRepository : Repository<Player>,

        @InjectRepository(CatchPlayer, 'sqlite')
        private readonly catchPlayerRepository: Repository<CatchPlayer>,

        @InjectRepository(RedGreenPlayer, 'sqlite')
        private readonly redGreenPlayerRepository: Repository<RedGreenPlayer>,

        @InjectRepository(CatchGame, 'sqlite')
        private readonly catchGameRepository: Repository<CatchGame>,

        @InjectRepository(RedGreenGame, 'sqlite')
        private readonly redGreenGameRepository: Repository<RedGreenGame>,

        @InjectRepository(Host, 'sqlite')
        private readonly hostRepository: Repository<Host>,
    ) {}

    // 호스트 생성
    async hostSave(host: Host) {
        return await this.hostRepository.save(host);
    }

    // 호스트 제거
    async hostRemove(uuid: string) {
        const host = await this.hostRepository.findOne({ where: { uuid } });
        await this.hostRepository.remove(host);
        return true;
    }

    // 호스트 조회
    async hostFind(uuid: string) {
        const host: Host = await this.hostRepository.findOne({ where: { uuid } });
        return host;
    }

    // 캐치 마인드 방 생성
    async catchGameRoomCreate(catchGameRoom: CatchGame, host_id: number) {
        const host = await this.hostRepository.findOne({
            where: { host_id: host_id },
        });
        host.room = Promise.resolve(catchGameRoom);
        await this.hostRepository.save(host);
        // console.log(catchroom.id);
        return catchGameRoom;
    }

    // 캐치 마인드 정답 입력
    async catchGameAnsCreate(ans: string, room_id: number) {
        const room = await this.catchGameRepository.findOne({
            where: { room_id: room_id },
        });
        room.ans = ans;
        await this.catchGameRepository.save(room);
        return true;
    }


    // 무궁화 꽃이 방 생성
    async redGreenGameRoomSave(redGreenGameRoom: RedGreenGame) {
        await this.redGreenGameRepository.save(redGreenGameRoom);
        // console.log(catchroom.id);
        return redGreenGameRoom;
    }

    // 무궁화 방 조회
    async redGreenGameFindByRoomId(room_id: number) {
        const room = await this.redGreenGameRepository.findOne({
            where: { room_id },
        });
        return room;
    }

    // 캐치마인드 플레이어 생성
    async catchGamePlayerCreate(player: CatchPlayer, room_id: number) {
        const room = await this.catchGameRepository.findOne({
            where: { room_id },
        });
        (await room.players).push(player);
        await this.catchGameRepository.save(room); // Fix: Pass the room object to the save method

        return player;
    }

    // 캐치마인트 플레이어 제거
    async catchGamePlayerRemove(uuid: string) {
        const player = await this.catchPlayerRepository.findOne({
            where: { uuid },
        });
        await this.catchPlayerRepository.remove(player);

        return true;
    }

    // 무궁화 꽃이 플레이어 생성
    async redGreenGamePlayerSave(player: RedGreenPlayer) {
        await this.redGreenPlayerRepository.save(player);
        return player;
    }

    // 무궁화 꽃이 플레이어 제거
    async redGreenGamePlayerRemove(uuid: string) {
        const player = await this.redGreenPlayerRepository.findOne({
            where: { uuid },
        });
        await this.redGreenPlayerRepository.remove(player);

        return true;
    }

    // 무궁화 꽃이 플레이어 조회
    async redGreenGamePlayerFindByUuid(uuid: string) {
        const player = await this.redGreenPlayerRepository.findOne({
            where: { uuid },
        });
        return player;
    }

    async hostDelete(req: any) {
        const host = await this.hostRepository.findOne({
            where: { uuid: req.uuid },
        });
        console.log(host);

        await this.hostRepository.remove(host);

        return '호스트 삭제';
    }

    async roomDelete(req: any) {
        const room = await this.catchGameRepository.findOne({
            where: { room_id: req.room_id },
        });
        console.log(room);

        await this.catchGameRepository.remove(room); // Fix: Use the remove method instead of delete

        return '룸 삭제';
    }

    async getHost(req: any) {
        let host = await this.hostRepository.findOne({
            where: { uuid: req.uuid },
        });
        // await host.room;
        await (
            await host.room
        ).players;
        // console.log("----------------------------------");
        // console.log(room);
        console.log((await host.room).players);
        console.log(host);
        return host;
    }

    async playercreate(req: any) {
        const player = new RedGreenPlayer();
        player.uuid = req.uuid;
        player.name = req.name;
        // player.socket_id = req.socket_id;

        console.log(req.room_id);
        const room = await this.redGreenGameRepository.findOne({
            where: { room_id: req.room_id },
        });
        console.log(room);
        (await room.players).push(player);
        console.log(room);
        await this.redGreenGameRepository.save(room); // Fix: Pass the room object to the save method
        console.log(room);

        return '플레이어 생성';
    }

    async RedGreenCreate() {
        let redGreenGame = new RedGreenGame();
        redGreenGame.room_id = 1;
        redGreenGame.current_user_num = 0;
        redGreenGame.user_num = 10;
        redGreenGame.status = 'wait';

        const host = await this.hostRepository.findOne({
            where: { host_id: 1 },
        });
        console.log(host);
        host.room = Promise.resolve(redGreenGame);
        console.log(host);
        await this.hostRepository.save(host);
        // console.log(catchroom.id);
        return '캐치마인드 방 만듦';
    }

    async catchreate() {
        let catchroom = new CatchGame();
        catchroom.room_id = 2;
        catchroom.ans = 'hello';
        catchroom.current_user_num = 0;
        catchroom.user_num = 10;
        catchroom.status = 'wait';
        const host = await this.hostRepository.findOne({
            where: { host_id: 1 },
        });
        console.log(host);
        host.room = Promise.resolve(catchroom);
        console.log(host);
        await this.hostRepository.save(host);
        // console.log(catchroom.id);
        return '캐치마인드 방 만듦';
    }

    async getcatchPlayers() {
        const players = await this.catchPlayerRepository.find();
        return players;
    }

    async getRedGreenPlayers() {
        const players = await this.redGreenPlayerRepository.find();
        return players;
    }

    findAll() {
        return `This action returns all sessionInfo`;
    }

    findOne(id: number) {
        return `This action returns a #${id} sessionInfo`;
    }

    // update(id: number, updateSessionInfoDto: UpdateSessionInfoDto) {
    //   return `This action updates a #${id} sessionInfo`;
    // }

    remove(id: number) {
        return `This action removes a #${id} sessionInfo`;
    }
}
