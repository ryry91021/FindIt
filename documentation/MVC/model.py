# model.py
class User:
    def __init__(self, name, age):
        self.name = name
        self.age = age

class UserModel:
    def __init__(self):
        self.users = []  # Simulating a database

    def add_user(self, name, age):
        user = User(name, age)
        self.users.append(user)

    def get_users(self):
        return self.users