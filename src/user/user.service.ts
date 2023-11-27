import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { NotFoundException } from '@nestjs/common';
import { assert } from 'console';

@Injectable()
export class UserService {
    /**
     * Here, we have used data mapper approch for this tutorial that is why we
     * injecting repository here. Another approch can be Active records.
     */
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {}

    /**
     * this is function is used to create User in User Entity.
     * @param createUserDto this will type of createUserDto in which
     * we have defined what are the keys we are expecting from body
     * @returns promise of user
     */
    createUser(createUserDto: CreateUserDto): Promise<User> {
        const user: User = new User();
        user.nickname = createUserDto.nickname;
        user.profileImage = createUserDto.profileImage;
        user.provider = createUserDto.provider;
        user.email = createUserDto.email;
        user.createdDt = new Date(Date.now());
        return this.userRepository.save(user);
    }

    /**
     * this function is used to get all the user's list
     * @returns promise of array of users
     */
    findAllUser(): Promise<User[]> {
        return this.userRepository.find();
    }

    findUser(email: string, provider: string): Promise<User> {
        if (!email) {
            throw new NotFoundException(`email not found`);
        }
        if (!provider) {
            throw new NotFoundException(`provider not found`);
        }
        Logger.log(`findUser: ${JSON.stringify({ email, provider })}`, 'UserService');
        return this.userRepository.findOne({ where: { email, provider } });
    }

    /**
     * this function used to get data of use whose id is passed in parameter
     * @param id is type of number, which represent the id of user.
     * @returns promise of user
     */
    async viewUser(id: number): Promise<User> {
        const user = await this.userRepository.findOneBy({ id });
        if (!user) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }
        return user;
    }

    /**
     * this function is used to update specific user information.
     * @param email is type of string, which represent the email of user.
     * @param _user this is updateUserDto, partial type of createUserDto.
     * @returns promise of udpate user
     */
    async updateUser(email: string, provider: string, _user: UpdateUserDto) {
        const user: User = await this.findUser(email, provider);
        user.nickname = _user.nickname;
        // user.profileImage = _user.profileImage;
        this.userRepository.save(user);
        return user;
    }

    /**
     * this function is used to remove or delete user from database.
     * @param email is the type of string, which represent email of user
     * @returns number of rows deleted or affected
     */
    removeUser(email: string): Promise<{ affected?: number }> {
        return this.userRepository.delete({ email });
    }
}
