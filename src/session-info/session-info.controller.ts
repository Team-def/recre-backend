import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Req,
} from '@nestjs/common';
import { SessionInfoService } from './session-info.service';

@Controller('session-info')
export class SessionInfoController {
    constructor(private readonly sessionInfoService: SessionInfoService) {}

    @Post('/make-host')
    create(@Req() req) {
        console.log(req.body);
        return this.sessionInfoService.hostCreate(req.body);
        // return this.sessionInfoService.create(createSessionInfoDto);
    }

    @Post('/make-catchroom')
    create2(@Req() req) {
        console.log(req.body);
        return this.sessionInfoService.RedGreenCreate();

        // return this.sessionInfoService.catchcreate();
    }

    @Post('/make-player')
    create23(@Req() req) {
        console.log(req.body);
        return this.sessionInfoService.playercreate(req.body);
        // return this.sessionInfoService.playercreate(req.body);
    }

    @Post('/delete_host')
    create233(@Req() req) {
        console.log(req.body);
        return this.sessionInfoService.hostDelete(req.body);
    }

    @Post('/delete_room')
    create2332(@Req() req) {
        console.log(req.body);
        return this.sessionInfoService.roomDelete(req.body);
    }

    @Get('/get_host')
    create23332(@Req() req) {
        console.log(req.body);
        return this.sessionInfoService.getHost(req.body);
    }

    @Get('/get_players/catch')
    create232332(@Req() req) {
        console.log(req.body);
        return this.sessionInfoService.getcatchPlayers();
    }

    @Get('/get_players/redgreen')
    create2323322(@Req() req) {
        console.log(req.body);
        return this.sessionInfoService.getRedGreenPlayers();
    }

    // @Get()
    // findAll() {
    //   return this.sessionInfoService.findAll();
    // }

    // @Get(':id')
    // findOne(@Param('id') id: string) {
    //   return this.sessionInfoService.findOne(+id);
    // }

    // @Patch(':id')
    // update(@Param('id') id: string, @Body() updateSessionInfoDto: UpdateSessionInfoDto) {
    //   return this.sessionInfoService.update(+id, updateSessionInfoDto);
    // }

    // @Delete(':id')
    // remove(@Param('id') id: string) {
    //   return this.sessionInfoService.remove(+id);
    // }
}
