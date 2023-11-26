export class RedGreenEntity {
    roomID: number;
    host: string;
    //총 인원
    user_num: number;
    //현재 인원
    current_user_num: number;
    goalDistance: number;
    winnerNum: number;

    //현재 세션 상태 0: 대기중, 1: 게임중, 2: 게임 종료
    status: number = 0;
    winner: string;

    constructor(
        roomID: number,
        host: string,
        goalDistance: number,
        user_num: number,
        current_user_num: number,
        winnerNum: number,
        status: number,
    ) {
        this.roomID = roomID;
        this.host = host;
        this.goalDistance = goalDistance;
        this.user_num = user_num;
        this.current_user_num = current_user_num;
        this.winnerNum = winnerNum;
        this.status = status;
    }
}
