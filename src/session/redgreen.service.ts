import { Injectable } from '@nestjs/common';
import { SessionInfoService } from 'src/session-info/session-info.service';

@Injectable()
export class RedGreenService {
    constructor(private readonly sessionInfoService: SessionInfoService) {}
}
