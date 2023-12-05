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
        return this.hostRepository.save(host);
    }

    // 호스트 제거
    async hostDelete(uuid: string) {
        return this.hostRepository.delete({ uuid });
    }

    // 호스트 조회 (방 아이디로)
    async hostFindByRoomId(room_id: number) {
        return this.hostRepository.findOne({ where: { room: { room_id } } });
    }

    // 호스트 조회
    async hostFindByUuid(uuid: string) {
        return this.hostRepository.findOne({ where: { uuid } });
    }

    // 캐치 마인드 방 생성
    async catchGameRoomSave(catchGameRoom: CatchGame) {
        return this.catchGameRepository.save(catchGameRoom);
    }

    // 캐치 마인드 방 조회 (방 아이디로)  
    async catchGameRoomFindByRoomId(room_id: number) {
        return this.catchGameRepository.findOne({
            where: { room_id },
        });
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

    // 무궁화 전체 방 조회
    async redGreenGameFindAll() {
        return this.redGreenGameRepository.find();
    }

    // 무궁화 꽃이 방 생성
    async redGreenGameSave(redGreenGameRoom: RedGreenGame) {
        return this.redGreenGameRepository.save(redGreenGameRoom);
    }

    // 무궁화 방 조회 (방 아이디로)
    async redGreenGameFindByRoomId(room_id: number) {
        return await this.redGreenGameRepository.findOne({
            where: { room_id },
        });
    }

    async catchGamePlayerFindByUuid(uuid: string) {
        return this.catchPlayerRepository.findOne({
            where: { uuid },
        });
    }

    // 캐치마인드 플레이어 생성
    async catchGamePlayerInsert(player: CatchPlayer) {
        return this.catchPlayerRepository.insert(player);
    }

    // 캐치마인드 플레이어 저장
    async catchGamePlayerSave(player: CatchPlayer) {
        return this.catchPlayerRepository.save(player);
    }

    // 캐치마인트 플레이어 제거
    async catchGamePlayerDelete(uuid: string) {
        return this.catchPlayerRepository.delete({ uuid });
    }

    // 무궁화 새로운 플레이어 추가
    async redGreenGamePlayerInsert(player: RedGreenPlayer) {
        return this.redGreenPlayerRepository.insert(player);
    }

    // 무궁화 꽃이 플레이어 생성
    async redGreenGamePlayerSave(player: RedGreenPlayer) {
        return this.redGreenPlayerRepository.save(player);
    }

    // 무궁화 꽃이 플레이어 제거
    async redGreenGamePlayerDelete(uuid: string) {
        return this.redGreenPlayerRepository.delete({ uuid });
    }

    // 무궁화 꽃이 플레이어 조회
    async redGreenGamePlayerFindByUuid(uuid: string) {
        return this.redGreenPlayerRepository.findOne({
            where: { uuid },
        });
    }

    async redGreenGamePlayerFindAll(): Promise<RedGreenPlayer[]> {
        return this.redGreenPlayerRepository.find();
    }

    // 무궁화 꽃이 플레이어 정렬 조회
    async redgreenGamePlayerSortedByMultipleConditions(room_id: number) {
        return this.redGreenPlayerRepository.find({
            where: { room: { room_id } },
            order: {
                distance: 'ASC',
                // endtime: 'DESC',
            },
        });
    }
}
