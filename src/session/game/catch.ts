export class Catch {
    roomID: number;
    host: string;
    //총 인원
    user_num: number;
    //현재 인원
    current_user_num: number;

    //현재 세션 상태 0: 대기중, 1: 게임중, 2: 게임 종료
    status: number = 0;
    winner: string;

    correctAnswer: string;
    constructor(
        roomID: number,
        host: string,
        user_num: number,
        correctAnswer: string,
        current_user_num: number,
        status: number,
    ) {
        this.roomID = roomID;
        this.host = host;
        this.user_num = user_num;
        this.correctAnswer = correctAnswer;
        this.current_user_num = current_user_num;
        this.status = status;
    }
}
