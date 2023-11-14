import { Injectable } from '@nestjs/common';
import { async } from 'rxjs';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { User } from 'src/user/entities/user.entity';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AuthService {
    constructor(private readonly userService: UserService) { }



    async googleLogin(req) {
        const user = await this.userService.findUserByEmail(req.user.email);
        console.log(user);
        if (user === null) {
            this.googleResister(req);
            console.log("user is not member");
        } else {
            console.log("user is member");
        }
    }

    googleResister(req) {
        const newUser: CreateUserDto = new CreateUserDto();
        newUser.email = req.user.email;
        newUser.nickname = req.user.displayName;
        newUser.profileImage = req.user.picture;
        newUser.provider = 'google';
        this.userService.createUser(newUser);
    }

}
