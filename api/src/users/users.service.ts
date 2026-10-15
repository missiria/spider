import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
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

  listActive(): Promise<User[]> {
    return this.repo.find({ where: { is_active: true }, order: { name: 'ASC' } });
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

  async invite(input: { email: string; name: string; role?: UserRole }): Promise<{ user: User; password: string }> {
    const email = input.email.trim().toLowerCase();
    if (await this.repo.findOne({ where: { email } })) {
      throw new ConflictException('Email already in use');
    }
    // 18 random bytes → 24 url-safe chars; shown once to the inviting admin
    const password = randomBytes(18).toString('base64url');
    const user = await this.create({ email, name: input.name, password, role: input.role ?? 'member' });
    return { user, password };
  }

  async deactivate(id: number, actingUserId: number): Promise<void> {
    if (id === actingUserId) {
      throw new ConflictException('You cannot deactivate your own account');
    }
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.is_active = false;
    await this.repo.save(user);
  }

  verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password_hash);
  }
}
