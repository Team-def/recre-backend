import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateClientDto } from './dto/create-client.dto';
import { Client } from './entities/client.entity';
@Injectable() export class ClientService {
  constructor(
    @InjectRepository(Client, 'sqlite') private Cientrepository: Repository<Client>,
  ) { }
  create() {
    console.log('create');
    const client = new Client();
    client.desc = 'test1111';
    this.Cientrepository.save(client); // - 저장 
    return 'This action adds a new crud';
  }
  findAll() {
    return this.Cientrepository.find(); // - 모든 항목 조회 
  }
  findOne(id: number) { // - 조건 조회 
    return this.Cientrepository.findOne({ where: { id: id, }, });
  }
}