import { Controller, Get, Post, Body, Put, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

/**
 * whatever the string pass in controller decorator it will be appended to
 * API URL. to call any API from this controller you need to add prefix which is
 * passed in controller decorator.
 * in our case our base URL is http://localhost:3000/user
 */
@Controller('user')
export class UserController {
    constructor(private readonly userService: UserService) {}

    /**
     * Post decorator represents method of request as we have used post decorator the method
     * of this API will be post.
     * so the API URL to create User will be
     * POST http://localhost:3000/user
     */
    @Post()
    create(@Body() createUserDto: CreateUserDto) {
        return this.userService.createUser(createUserDto);
    }

    /**
     * we have used get decorator to get the user by email
     * so the API URL will be
     * GET http://localhost:3000/user
     */
    @Get()
    @UseGuards(JwtAuthGuard)
    findUser(@Req() req) {
        return this.userService.findUser(req.payload.email, req.payload.provider);
    }

    /**
     * we have used get decorator with id param to get id from request
     * so the API URL will be
     * GET http://localhost:3000/user/:id
     */
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.userService.viewUser(+id);
    }

    /**
     * we have used put decorator and get email from request.
     * PUT http://localhost:3000/user
     */
    @Put()
    @UseGuards(JwtAuthGuard)
    update(@Req() req, @Body() user: UpdateUserDto) {
        return this.userService.updateUser(req.payload.email, req.payload.provider, user);
    }

    /**
     * we have used Delete decorator and get email from request.
     * DELETE http://localhost:3000/user
     */
    @Delete()
    @UseGuards(JwtAuthGuard)
    remove(@Req() req) {
        return this.userService.removeUser(req.payload.email);
    }
}
