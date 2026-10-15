import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  count(): Promise<number> {
    return this.repo.count();
  }

  async create(input: {
    email: string;
    password: string;
    name: string;
    role?: UserRole;
  }): Promise<User> {
    const user = this.repo.create({
      email: input.email.trim().toLowerCase(),
      password_hash: await bcrypt.hash(input.password, 10),
      name: input.name,
      role: input.role ?? 'admin',
      is_active: true,
    });
    return this.repo.save(user);
  }

  verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password_hash);
  }
}
