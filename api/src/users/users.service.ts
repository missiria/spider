import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

  findById(id: number): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async updateProfile(
    id: number,
    input: { name?: string; email?: string },
  ): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (input.email !== undefined) {
      const email = input.email.trim().toLowerCase();
      if (email !== user.email) {
        const taken = await this.repo.findOne({ where: { email } });
        if (taken) {
          throw new ConflictException('Email already in use');
        }
        user.email = email;
      }
    }
    if (input.name !== undefined) {
      user.name = input.name.trim();
    }
    return this.repo.save(user);
  }

  toPublic(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      created_at: user.created_at,
    };
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
