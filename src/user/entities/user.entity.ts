import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class User {
  /**
   * this decorator will help to auto generate id for the table.
   */
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 30 })
  name: string;

  // @Column({ type: 'varchar', length: 15 })
  // username: string;

  // @Column({ type: 'varchar', length: 40 })
  // email: string;

  // @Column({ type: 'int' })
  // age: number;

  @Column({ type: 'varchar', nullable: true })
  password: string;

  @Column({ type: 'int', array: true, nullable: true })
  myArray: Number[];

  /**
   * m - male
   * f - female
   * u - unspecified
   */
  // @Column({ type: 'enum', enum: ['m', 'f', 'u'], nullable: true })
  // gender: string | null;
}
