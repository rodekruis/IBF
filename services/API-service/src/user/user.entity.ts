import { ApiProperty } from '@nestjs/swagger';
import crypto from 'node:crypto';
import { BeforeInsert, Column, Entity, Index } from 'typeorm';

import { BaseIbfEntity } from '@API-service/src/base.entity';

@Entity('user')
export class UserEntity extends BaseIbfEntity {
  @Index({ unique: true })
  @Column({ type: 'character varying', nullable: true })
  @ApiProperty({ example: 'username' })
  public username: string | null;

  @Column({ select: false })
  @ApiProperty()
  public password: string;

  @BeforeInsert()
  public hashPassword(): any {
    this.salt = crypto.randomBytes(16).toString('hex');
    this.password = crypto
      .pbkdf2Sync(this.password, this.salt, 1, 32, 'sha256')
      .toString('hex');
  }

  @Column({ default: false })
  @ApiProperty({ example: false })
  public admin: boolean;

  @Column({ nullable: true, select: false, type: 'character varying' })
  @ApiProperty()
  public salt: string | null;

  @Column({ type: 'timestamp', nullable: true })
  @ApiProperty({ example: new Date() })
  public lastLogin: Date | null;

  @Column({ type: 'character varying', nullable: false })
  public displayName: string;
}
