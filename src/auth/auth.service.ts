import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AuthService {
  constructor(private readonly userService: UserService) {}

  async googleLogin(req) {
    const user = await this.userService.findUserByEmail(req.user.email);
    console.log(user);
    if (user === null) {
      this.googleResister(req);
      console.log('user is not member');
    } else {
      console.log('user is member');
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

  async kakaoLogin(req): Promise<any> {
    if (!req.user) {
      throw new BadRequestException('No user from kakao');
    }
    console.log('req.user', req.user);
    const { nickname, email, profile_image } = req.user;

    // Find user in db
    const user = await this.userService.findUserByEmail(email);

    // If no user found, create one
    if (!user) {
      const newUser: CreateUserDto = new CreateUserDto();
      newUser.email = email;
      newUser.nickname = nickname;
      newUser.profileImage = profile_image;
      newUser.provider = 'kakao';
      this.userService.createUser(newUser);
    }

    return {
      message: 'User information from kakao',
      user,
    };
  }
}
